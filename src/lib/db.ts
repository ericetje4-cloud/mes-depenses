// ===========================================================================
// Couche d'accès IndexedDB (offline-first, zéro réseau).
// Bibliothèque : idb (wrapper léger Promise-based).
//
// Object stores (magasins) :
//   - transactions     : dépenses (keyPath "id", index sur date + categoryId)
//   - categories       : catégories (keyPath "id", index sur order)
//   - merchantRules    : apprentissage marchand->catégorie (keyPath "merchant")
//   - budgets          : budgets mensuels (keyPath "id", index sur categoryId)
//   - settings         : paramètres key-value (keyPath "key")
// ===========================================================================

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Budget,
  Category,
  MerchantRule,
  Setting,
  SettingKey,
  Transaction,
} from '@/types';

// ---------------------------------------------------------------------------
// Constantes & version
// ---------------------------------------------------------------------------

const DB_NAME = 'mes-depenses';
const DB_VERSION = 1;
const STORE_TX = 'transactions';
const STORE_CAT = 'categories';
const STORE_RULES = 'merchantRules';
const STORE_BUDGET = 'budgets';
const STORE_SETTINGS = 'settings';

/** Version logique du schéma d'export (incrémenter à chaque rupture). */
export const BACKUP_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Définition du schéma typé (DBSchema de idb)
// ---------------------------------------------------------------------------

interface DepensesDB extends DBSchema {
  [STORE_TX]: {
    key: string;
    value: Transaction;
    indexes: {
      'by-date': string; // index sur date (tri rapide par période)
      'by-category': string; // index sur categoryId (filtre)
    };
  };
  [STORE_CAT]: {
    key: string;
    value: Category;
    indexes: { 'by-order': number };
  };
  [STORE_RULES]: {
    key: string; // = merchant normalisé
    value: MerchantRule;
  };
  [STORE_BUDGET]: {
    key: string;
    value: Budget;
    indexes: { 'by-category': string };
  };
  [STORE_SETTINGS]: {
    key: SettingKey;
    value: Setting;
  };
}

// ---------------------------------------------------------------------------
// Singleton de la connexion
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase<DepensesDB>> | null = null;

function getDB(): Promise<IDBPDatabase<DepensesDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DepensesDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // transactions
        if (!db.objectStoreNames.contains(STORE_TX)) {
          const txStore = db.createObjectStore(STORE_TX, { keyPath: 'id' });
          txStore.createIndex('by-date', 'date');
          txStore.createIndex('by-category', 'categoryId');
        }
        // categories
        if (!db.objectStoreNames.contains(STORE_CAT)) {
          const catStore = db.createObjectStore(STORE_CAT, { keyPath: 'id' });
          catStore.createIndex('by-order', 'order');
        }
        // merchantRules (key = merchant normalisé)
        if (!db.objectStoreNames.contains(STORE_RULES)) {
          db.createObjectStore(STORE_RULES, { keyPath: 'merchant' });
        }
        // budgets
        if (!db.objectStoreNames.contains(STORE_BUDGET)) {
          const budStore = db.createObjectStore(STORE_BUDGET, {
            keyPath: 'id',
          });
          budStore.createIndex('by-category', 'categoryId');
        }
        // settings (key-value)
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      },
      blocked() {
        console.warn(
          '[db] IndexedDB upgrade bloqué : fermez les autres onglets de l\'app.',
        );
      },
      terminated() {
        console.warn('[db] Connexion IndexedDB terminée inopinément.');
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Génération d'IDs : triable chronologiquement et unique.
// Format : base36(Date.now()) + base36(counter) + random → ~16 chars.
// ---------------------------------------------------------------------------

let idCounter = 0;
export function generateId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const counter = idCounter.toString(36).padStart(3, '0');
  const rand = Math.floor(Math.random() * 46656) // 36^3
    .toString(36)
    .padStart(3, '0');
  return `${time}${counter}${rand}`;
}

// ---------------------------------------------------------------------------
// SEED : catégories par défaut (au premier lancement)
// ---------------------------------------------------------------------------

/** Les 9 catégories imposées par le cahier des charges. */
export const DEFAULT_CATEGORIES: Category[] = [
  { label: 'Alimentation', icon: 'ShoppingCart', color: '#22c55e', order: 1 },
  { label: 'Transport', icon: 'Bus', color: '#3b82f6', order: 2 },
  { label: 'Logement', icon: 'Home', color: '#a855f7', order: 3 },
  { label: 'Loisirs', icon: 'Gamepad2', color: '#ec4899', order: 4 },
  { label: 'Santé', icon: 'HeartPulse', color: '#ef4444', order: 5 },
  { label: 'Shopping', icon: 'ShoppingBag', color: '#f59e0b', order: 6 },
  { label: 'Abonnements', icon: 'Repeat', color: '#14b8a6', order: 7 },
  { label: 'Restaurants', icon: 'UtensilsCrossed', color: '#f97316', order: 8 },
  { label: 'Autre', icon: 'Circle', color: '#64748b', order: 9 },
].map((c) => ({
  ...c,
  id: `default-${c.order}`,
  isDefault: true,
  createdAt: 0,
}));

async function seedIfEmpty(): Promise<void> {
  const db = await getDB();
  const count = await db.count(STORE_CAT);
  if (count > 0) return;

  const tx = db.transaction(STORE_CAT, 'readwrite');
  await Promise.all(DEFAULT_CATEGORIES.map((c) => tx.store.put(c)));
  await tx.done;
}

/**
 * Initialise la base : ouvre la connexion + sème les catégories par défaut.
 * À appeler une seule fois au démarrage de l'app (dans main.tsx ou App).
 */
export async function initDB(): Promise<void> {
  await getDB();
  await seedIfEmpty();
}

// ===========================================================================
// TRANSACTIONS (dépenses)
// ===========================================================================

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  // Index by-date → tri décroissant (plus récent d'abord).
  const all = await db.getAllFromIndex(STORE_TX, 'by-date');
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getTransaction(id: string): Promise<Transaction | undefined> {
  const db = await getDB();
  return db.get(STORE_TX, id);
}

export async function putTransaction(tx: Transaction): Promise<void> {
  const db = await getDB();
  await db.put(STORE_TX, tx);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_TX, id);
}

export async function bulkPutTransactions(items: Transaction[]): Promise<void> {
  if (items.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(STORE_TX, 'readwrite');
  await Promise.all(items.map((t) => tx.store.put(t)));
  await tx.done;
}

// ===========================================================================
// CATEGORIES
// ===========================================================================

export async function getAllCategories(): Promise<Category[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_CAT, 'by-order');
  return all.sort((a, b) => a.order - b.order);
}

export async function putCategory(cat: Category): Promise<void> {
  const db = await getDB();
  await db.put(STORE_CAT, cat);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_CAT, id);
}

// ===========================================================================
// MERCHANT RULES (apprentissage local)
// ===========================================================================

export async function getAllMerchantRules(): Promise<MerchantRule[]> {
  const db = await getDB();
  return db.getAll(STORE_RULES);
}

export async function putMerchantRule(rule: MerchantRule): Promise<void> {
  const db = await getDB();
  await db.put(STORE_RULES, rule);
}

export async function deleteMerchantRule(merchant: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_RULES, merchant);
}

// ===========================================================================
// BUDGETS
// ===========================================================================

export async function getAllBudgets(): Promise<Budget[]> {
  const db = await getDB();
  return db.getAll(STORE_BUDGET);
}

export async function putBudget(budget: Budget): Promise<void> {
  const db = await getDB();
  await db.put(STORE_BUDGET, budget);
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_BUDGET, id);
}

// ===========================================================================
// SETTINGS (key-value)
// ===========================================================================

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<Setting<K>['value'] | undefined> {
  const db = await getDB();
  const row = await db.get(STORE_SETTINGS, key);
  return row?.value as Setting<K>['value'] | undefined;
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: Setting<K>['value'],
): Promise<void> {
  const db = await getDB();
  const row: Setting<K> = { key, value, updatedAt: Date.now() };
  await db.put(STORE_SETTINGS, row);
}

export async function getAllSettings(): Promise<Setting[]> {
  const db = await getDB();
  return db.getAll(STORE_SETTINGS);
}

// ===========================================================================
// EXPORT / IMPORT (sauvegarde JSON complète)
// ===========================================================================

import type { BackupPayload } from '@/types';

/** Exporte TOUT le contenu de la base en un objet sérialisable. */
export async function exportDB(): Promise<BackupPayload> {
  const db = await getDB();
  const [transactions, categories, merchantRules, budgets, settings] =
    await Promise.all([
      db.getAll(STORE_TX),
      db.getAll(STORE_CAT),
      db.getAll(STORE_RULES),
      db.getAll(STORE_BUDGET),
      db.getAll(STORE_SETTINGS),
    ]);

  return {
    app: 'mes-depenses',
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    transactions,
    categories,
    merchantRules,
    budgets,
    settings,
  };
}

/**
 * Importe une sauvegarde JSON.
 * @param merge true (défaut) : conserve les données existantes, écrase les
 *                  doublons par même id/merchant. Les nouvelles sont ajoutées.
 * @param merge false : efface puis remplace (destructif).
 */
export async function importDB(
  payload: BackupPayload,
  merge = true,
): Promise<void> {
  const db = await getDB();

  const stores = [
    STORE_TX,
    STORE_CAT,
    STORE_RULES,
    STORE_BUDGET,
    STORE_SETTINGS,
  ] as const;

  const tx = db.transaction([...stores], 'readwrite');

  if (!merge) {
    await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  }

  // Put gère l'upsert : même keyPath → remplacement, sinon ajout.
  await Promise.all([
    ...payload.transactions.map((t) => tx.objectStore(STORE_TX).put(t)),
    ...payload.categories.map((c) => tx.objectStore(STORE_CAT).put(c)),
    ...payload.merchantRules.map((r) => tx.objectStore(STORE_RULES).put(r)),
    ...payload.budgets.map((b) => tx.objectStore(STORE_BUDGET).put(b)),
    ...payload.settings.map((s) => tx.objectStore(STORE_SETTINGS).put(s)),
  ]);

  await tx.done;
}

// ---------------------------------------------------------------------------
// Utilitaire de réinitialisation complète (débogage / Settings).
// ---------------------------------------------------------------------------

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    [STORE_TX, STORE_CAT, STORE_RULES, STORE_BUDGET, STORE_SETTINGS],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore(STORE_TX).clear(),
    tx.objectStore(STORE_CAT).clear(),
    tx.objectStore(STORE_RULES).clear(),
    tx.objectStore(STORE_BUDGET).clear(),
    tx.objectStore(STORE_SETTINGS).clear(),
  ]);
  await tx.done;
  await seedIfEmpty();
}
