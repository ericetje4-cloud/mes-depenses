import * as db from './db'
import { normalizeMerchant } from './categories'
import type { Expense } from '../types'

/**
 * Enregistre l'association marchand -> catégorie suite à la validation
 * d'une dépense. Constitue l'apprentissage local utilisé pour les suggestions.
 */
export async function learnMerchantFromExpense(expense: Expense): Promise<void> {
  const key = normalizeMerchant(expense.merchant)
  if (!key) return
  await db.learnMerchant(key, expense.categoryId)
}

/** Génère un identifiant unique. */
export function uid(): string {
  return crypto.randomUUID()
}
