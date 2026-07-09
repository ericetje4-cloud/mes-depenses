// ===========================================================================
// Store applicatif central : état React partagé alimenté par IndexedDB.
//
// Approche : un singleton (module-level) expose des fonctions de mutation,
// et le hook `useStore` s'y abonne via useSyncExternalStore.
// Garanti zéro réseau : tout repose sur IndexedDB.
// ===========================================================================

import { useSyncExternalStore } from 'react';
import {
  bulkPutTransactions,
  clearAllData,
  deleteBudget as dbDeleteBudget,
  deleteCategory as dbDeleteCategory,
  deleteMerchantRule as dbDeleteMerchantRule,
  deleteTransaction as dbDeleteTransaction,
  exportDB,
  getAllBudgets,
  getAllCategories,
  getAllMerchantRules,
  getAllTransactions,
  importDB,
  initDB,
  putBudget as dbPutBudget,
  putCategory as dbPutCategory,
  putMerchantRule as dbPutMerchantRule,
  putTransaction as dbPutTransaction,
} from '@/lib/db';
import type {
  Budget,
  Category,
  MerchantRule,
  Transaction,
} from '@/types';

export interface StoreState {
  ready: boolean;
  transactions: Transaction[];
  categories: Category[];
  merchantRules: MerchantRule[];
  budgets: Budget[];
}

// ---------------------------------------------------------------------------
// État singleton + listeners
// ---------------------------------------------------------------------------

const emptyState: StoreState = {
  ready: false,
  transactions: [],
  categories: [],
  merchantRules: [],
  budgets: [],
};

let state: StoreState = emptyState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
  return state;
}

// ---------------------------------------------------------------------------
// Initialisation : à appeler une fois au démarrage.
// ---------------------------------------------------------------------------

let initStarted = false;

export async function initStore(): Promise<void> {
  if (initStarted || state.ready) return;
  initStarted = true;

  await initDB();

  const [transactions, categories, merchantRules, budgets] = await Promise.all([
    getAllTransactions(),
    getAllCategories(),
    getAllMerchantRules(),
    getAllBudgets(),
  ]);

  setState({ ready: true, transactions, categories, merchantRules, budgets });
}

// ---------------------------------------------------------------------------
// Rechargements partiels (après chaque mutation)
// ---------------------------------------------------------------------------

async function reloadTransactions() {
  setState({ transactions: await getAllTransactions() });
}
async function reloadCategories() {
  setState({ categories: await getAllCategories() });
}
async function reloadRules() {
  setState({ merchantRules: await getAllMerchantRules() });
}
async function reloadBudgets() {
  setState({ budgets: await getAllBudgets() });
}

// ---------------------------------------------------------------------------
// TRANSACTIONS
// ---------------------------------------------------------------------------

/** Crée une nouvelle dépense. Gère updatedAt + apprentissage marchand. */
export async function addTransaction(
  data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Transaction> {
  const now = Date.now();
  const tx: Transaction = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await dbPutTransaction(tx);

  // Apprentissage : on enregistre / met à jour la règle marchand -> catégorie.
  await learnMerchant(tx.merchant, tx.categoryId);

  await reloadTransactions();
  return tx;
}

/** Met à jour une dépense existante. */
export async function updateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = state.transactions.find((t) => t.id === id);
  if (!existing) return;
  const updated: Transaction = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await dbPutTransaction(updated);

  // Si le marchand ou la catégorie change, on réapprend.
  if (patch.merchant || patch.categoryId) {
    await learnMerchant(updated.merchant, updated.categoryId);
  }

  await reloadTransactions();
}

export async function removeTransaction(id: string): Promise<void> {
  await dbDeleteTransaction(id);
  await reloadTransactions();
}

// ---------------------------------------------------------------------------
// APPRENTISSAGE MARCHAND (catégorisation intelligente)
// ---------------------------------------------------------------------------

/** Normalise un nom de marchand : lowercase, sans accents, trimmed. */
export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9 ]/g, ' ') // ponctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Suggère une catégorie pour un marchand :
 *  1. règle apprise (merchantRules)
 *  2. mappings intégrés (voir categories.ts à l'étape 3)
 * Retourne undefined si aucune suggestion.
 */
export function suggestCategory(merchant: string): string | undefined {
  const key = normalizeMerchant(merchant);
  if (!key) return undefined;

  // 1. Règle apprise par l'utilisateur (prioritaire)
  const learned = state.merchantRules.find((r) => r.merchant === key);
  if (learned) return learned.categoryId;

  // 2. Mappings intégrés (chargés à l'étape 3 via categories.ts)
  const builtin = getBuiltinSuggestion(key);
  return builtin ?? undefined;
}

// La fn ci-dessous est alimentée à l'étape 3 par categories.ts.
// Tant que ce module n'est pas créé, elle retourne undefined (pas de mapping).
let builtinSuggestionFn: (normalizedMerchant: string) => string | null =
  () => null;

/** À appeler par categories.ts (étape 3) pour brancher les mappings. */
export function _registerBuiltinSuggestionFn(
  fn: (normalizedMerchant: string) => string | null,
): void {
  builtinSuggestionFn = fn;
}
function getBuiltinSuggestion(key: string): string | null {
  return builtinSuggestionFn(key);
}

/**
 * Enregistre / met à jour la règle d'apprentissage pour un marchand.
 */
export async function learnMerchant(
  merchant: string,
  categoryId: string,
): Promise<void> {
  const key = normalizeMerchant(merchant);
  if (!key) return;
  const rule: MerchantRule = {
    merchant: key,
    categoryId,
    updatedAt: Date.now(),
  };
  await dbPutMerchantRule(rule);
  await reloadRules();
}

export async function forgetMerchant(merchant: string): Promise<void> {
  await dbDeleteMerchantRule(normalizeMerchant(merchant));
  await reloadRules();
}

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------

export async function addCategory(
  data: Omit<Category, 'id' | 'createdAt' | 'order'> & { order?: number },
): Promise<Category> {
  const order = data.order ?? state.categories.length + 1;
  const cat: Category = {
    ...data,
    id: crypto.randomUUID(),
    order,
    createdAt: Date.now(),
  };
  await dbPutCategory(cat);
  await reloadCategories();
  return cat;
}

export async function updateCategory(
  id: string,
  patch: Partial<Omit<Category, 'id'>>,
): Promise<void> {
  const existing = state.categories.find((c) => c.id === id);
  if (!existing) return;
  await dbPutCategory({ ...existing, ...patch });
  await reloadCategories();
}

export async function removeCategory(id: string): Promise<void> {
  await dbDeleteCategory(id);
  await reloadCategories();
}

// ---------------------------------------------------------------------------
// BUDGETS
// ---------------------------------------------------------------------------

export async function setBudget(
  scope: Budget['scope'],
  amount: number,
  categoryId?: string,
): Promise<void> {
  // Un seul budget par (scope, categoryId) : on cherche l'existant.
  const existing =
    scope === 'global'
      ? state.budgets.find((b) => b.scope === 'global')
      : state.budgets.find(
          (b) => b.scope === 'category' && b.categoryId === categoryId,
        );

  if (existing) {
    await dbPutBudget({ ...existing, amount, updatedAt: Date.now() });
  } else {
    const budget: Budget = {
      id: crypto.randomUUID(),
      scope,
      categoryId,
      amount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await dbPutBudget(budget);
  }
  await reloadBudgets();
}

export async function removeBudget(id: string): Promise<void> {
  await dbDeleteBudget(id);
  await reloadBudgets();
}

// ---------------------------------------------------------------------------
// EXPORT / IMPORT / RESET
// ---------------------------------------------------------------------------

export async function exportStore(): Promise<ReturnType<typeof exportDB>> {
  return exportDB();
}

export async function importStore(
  payload: Parameters<typeof importDB>[0],
  merge = true,
): Promise<void> {
  await importDB(payload, merge);
  await initStore();
}

export async function resetStore(): Promise<void> {
  await clearAllData();
  await reloadTransactions();
  await reloadCategories();
  await reloadRules();
  await reloadBudgets();
}

/**
 * Import en masse de transactions (utilisé par les tests / seed éventuel).
 */
export async function bulkAddTransactions(items: Transaction[]): Promise<void> {
  await bulkPutTransactions(items);
  await reloadTransactions();
}

// ---------------------------------------------------------------------------
// HOOK REACT
// ---------------------------------------------------------------------------

/**
 * Hook principal : renvoie l'état applicatif synchronisé avec IndexedDB.
 * Réagir aux changements via useSyncExternalStore (React 18+/19).
 */
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
