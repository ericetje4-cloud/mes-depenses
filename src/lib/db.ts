import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Budget, Category, Expense, MerchantCategory } from '../types'
import { DEFAULT_CATEGORIES } from './categories'

/**
 * Schéma de la base IndexedDB locale.
 * 4 object stores : expenses, categories, budgets, merchantCategories.
 */
interface DepensesDB extends DBSchema {
  expenses: {
    key: string
    value: Expense
    indexes: { 'by-date': string; 'by-category': string }
  }
  categories: {
    key: string
    value: Category
  }
  budgets: {
    key: string
    value: Budget
    indexes: { 'by-type': string }
  }
  merchantCategories: {
    key: string
    value: MerchantCategory
  }
}

const DB_NAME = 'depenses-db'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<DepensesDB>> | null = null

/** Ouvre (et crée à la première fois) la base de données. */
function getDB(): Promise<IDBPDatabase<DepensesDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DepensesDB>(DB_NAME, DB_VERSION, {
      async upgrade(db) {
        // expenses
        if (!db.objectStoreNames.contains('expenses')) {
          const expenses = db.createObjectStore('expenses', { keyPath: 'id' })
          expenses.createIndex('by-date', 'date')
          expenses.createIndex('by-category', 'categoryId')
        }
        // categories
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' })
        }
        // budgets
        if (!db.objectStoreNames.contains('budgets')) {
          const budgets = db.createObjectStore('budgets', { keyPath: 'id' })
          budgets.createIndex('by-type', 'type')
        }
        // merchantCategories (apprentissage)
        if (!db.objectStoreNames.contains('merchantCategories')) {
          db.createObjectStore('merchantCategories', { keyPath: 'merchant' })
        }
      },
      async terminated() {
        dbPromise = null
      },
    })
  }
  return dbPromise
}

/** Initialise les catégories par défaut si la base est vide. */
export async function seedDefaults(): Promise<void> {
  const db = await getDB()
  const count = await db.count('categories')
  if (count === 0) {
    const tx = db.transaction('categories', 'readwrite')
    await Promise.all(DEFAULT_CATEGORIES.map((c) => tx.store.put(c)))
    await tx.done
  }
}

// ----------------------------------------------------------------------------
// EXPENSES
// ----------------------------------------------------------------------------

export async function getAllExpenses(): Promise<Expense[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('expenses', 'by-date')
  // Index trié ascendant ; on veut du plus récent au plus ancien.
  return all.reverse()
}

export async function getExpense(id: string): Promise<Expense | undefined> {
  const db = await getDB()
  return db.get('expenses', id)
}

export async function saveExpense(expense: Expense): Promise<void> {
  const db = await getDB()
  await db.put('expenses', expense)
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('expenses', id)
}

export async function deleteAllExpenses(): Promise<void> {
  const db = await getDB()
  await db.clear('expenses')
}

// ----------------------------------------------------------------------------
// CATEGORIES
// ----------------------------------------------------------------------------

export async function getAllCategories(): Promise<Category[]> {
  const db = await getDB()
  const all = await db.getAll('categories')
  return all.sort((a, b) => a.order - b.order)
}

export async function saveCategory(category: Category): Promise<void> {
  const db = await getDB()
  await db.put('categories', category)
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('categories', id)
}

// ----------------------------------------------------------------------------
// BUDGETS
// ----------------------------------------------------------------------------

export async function getAllBudgets(): Promise<Budget[]> {
  const db = await getDB()
  return db.getAll('budgets')
}

export async function saveBudget(budget: Budget): Promise<void> {
  const db = await getDB()
  await db.put('budgets', budget)
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('budgets', id)
}

// ----------------------------------------------------------------------------
// MERCHANT CATEGORIES (apprentissage local)
// ----------------------------------------------------------------------------

/** Renvoie l'apprentissage sous forme de map { marchandNormalisé: categoryId }. */
export async function getLearnedMerchants(): Promise<Record<string, string>> {
  const db = await getDB()
  const all = await db.getAll('merchantCategories')
  const map: Record<string, string> = {}
  for (const m of all) map[m.merchant] = m.categoryId
  return map
}

/**
 * Enregistre (ou renforce) l'association marchand -> catégorie.
 * Utilisé après validation d'une dépense ou correction manuelle.
 */
export async function learnMerchant(
  merchant: string,
  categoryId: string,
): Promise<void> {
  const db = await getDB()
  const existing = await db.get('merchantCategories', merchant)
  await db.put('merchantCategories', {
    merchant,
    categoryId,
    count: (existing?.count ?? 0) + 1,
    updatedAt: Date.now(),
  })
}

export async function deleteLearnedMerchant(merchant: string): Promise<void> {
  const db = await getDB()
  await db.delete('merchantCategories', merchant)
}

// ----------------------------------------------------------------------------
// IMPORT / EXPORT (sauvegarde JSON complète)
// ----------------------------------------------------------------------------

export async function exportAll(): Promise<{
  expenses: Expense[]
  categories: Category[]
  budgets: Budget[]
  merchantCategories: MerchantCategory[]
}> {
  const db = await getDB()
  const [expenses, categories, budgets, merchantCategories] = await Promise.all([
    db.getAll('expenses'),
    db.getAll('categories'),
    db.getAll('budgets'),
    db.getAll('merchantCategories'),
  ])
  return { expenses, categories, budgets, merchantCategories }
}

/** Réinitialise toutes les données et importe le contenu d'une sauvegarde. */
export async function importAll(data: {
  expenses?: Expense[]
  categories?: Category[]
  budgets?: Budget[]
  merchantCategories?: MerchantCategory[]
}): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(
    ['expenses', 'categories', 'budgets', 'merchantCategories'],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore('expenses').clear(),
    tx.objectStore('categories').clear(),
    tx.objectStore('budgets').clear(),
    tx.objectStore('merchantCategories').clear(),
  ])
  await Promise.all([
    ...(data.expenses ?? []).map((e) => tx.objectStore('expenses').put(e)),
    ...(data.categories ?? []).map((c) => tx.objectStore('categories').put(c)),
    ...(data.budgets ?? []).map((b) => tx.objectStore('budgets').put(b)),
    ...(data.merchantCategories ?? []).map((m) =>
      tx.objectStore('merchantCategories').put(m),
    ),
  ])
  await tx.done
}

/** Efface absolument toutes les données (reset usine). */
export async function wipeAllData(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(
    ['expenses', 'categories', 'budgets', 'merchantCategories'],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore('expenses').clear(),
    tx.objectStore('categories').clear(),
    tx.objectStore('budgets').clear(),
    tx.objectStore('merchantCategories').clear(),
  ])
  await tx.done
  await seedDefaults()
}
