import type { BackupFile, Category, Expense } from '../types'
import * as db from './db'
import { formatDate } from './format'

// ----------------------------------------------------------------------------
// CSV
// ----------------------------------------------------------------------------

/** Échappe une valeur pour le format CSV (RFC 4180). */
function csvField(value: string | number): string {
  const s = String(value)
  if (/[",;\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Génère le contenu CSV des dépenses passées en paramètre.
 * (On exporte les données filtrées, pas toute la base.)
 */
export function expensesToCSV(expenses: Expense[], categories: Category[]): string {
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Autre'
  const header = ['Date', 'Marchand', 'Catégorie', 'Montant (€)', 'Note']
  const rows = expenses.map((e) => [
    formatDate(e.date),
    e.merchant,
    catName(e.categoryId),
    e.amount.toFixed(2),
    e.note ?? '',
  ])
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\n')
}

// ----------------------------------------------------------------------------
// TÉLÉCHARGEMENT
// ----------------------------------------------------------------------------

/** Déclenche le téléchargement d'un contenu textuel côté navigateur. */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Exporte les dépenses filtrées en CSV. */
export function exportCSV(expenses: Expense[], categories: Category[]): void {
  const csv = expensesToCSV(expenses, categories)
  const date = new Date().toISOString().slice(0, 10)
  downloadText(`depenses-${date}.csv`, csv, 'text/csv;charset=utf-8')
}

// ----------------------------------------------------------------------------
// JSON (sauvegarde / restauration complète)
// ----------------------------------------------------------------------------

/** Génère et télécharge une sauvegarde JSON complète de la base. */
export async function exportJSON(): Promise<void> {
  const { expenses, categories, budgets, merchantCategories } = await db.exportAll()
  const backup: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'depenses-pwa',
    expenses,
    categories,
    budgets,
    merchantCategories,
  }
  const date = new Date().toISOString().slice(0, 10)
  downloadText(
    `sauvegarde-depenses-${date}.json`,
    JSON.stringify(backup, null, 2),
    'application/json',
  )
}

/** Lit un fichier de sauvegarde JSON et l'importe dans la base. */
export async function importJSON(file: File): Promise<void> {
  const text = await file.text()
  let data: BackupFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Fichier JSON invalide.')
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.expenses)) {
    throw new Error('Format de sauvegarde non reconnu.')
  }
  await db.importAll({
    expenses: data.expenses,
    categories: data.categories,
    budgets: data.budgets,
    merchantCategories: data.merchantCategories,
  })
}
