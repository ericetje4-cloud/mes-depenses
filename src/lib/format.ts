import type { Budget, Category, Expense } from '../types'

// ----------------------------------------------------------------------------
// FORMATAGE
// ----------------------------------------------------------------------------

/** Formate un montant en euros (format français). */
export function formatEUR(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

/** Formate une date ISO (YYYY-MM-DD) en format lisible français. */
export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/** Formate une date ISO en format court (JJ/MM). */
export function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  }).format(d)
}

/** Renvoie la clé mois-année (YYYY-MM) d'une date ISO. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Renvoie le libellé d'un mois (ex: "mars 2025"). */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** Date du jour au format ISO (YYYY-MM-DD, heure locale). */
export function todayISO(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60 * 1000).toISOString().slice(0, 10)
}

// ----------------------------------------------------------------------------
// STATISTIQUES
// ----------------------------------------------------------------------------

/** Total d'une liste de dépenses. */
export function totalExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0)
}

/** Filtre les dépenses d'un mois donné (clé YYYY-MM). */
export function expensesByMonth(expenses: Expense[], key: string): Expense[] {
  return expenses.filter((e) => monthKey(e.date) === key)
}

/** Clé du mois courant. */
export function currentMonthKey(): string {
  return monthKey(todayISO())
}

/** Clé du mois précédent. */
export function previousMonthKey(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60 * 1000).toISOString().slice(0, 7)
}

export interface CategoryTotal {
  categoryId: string
  name: string
  color: string
  icon: string
  total: number
  count: number
}

/** Répartition par catégorie pour une liste de dépenses. */
export function totalsByCategory(
  expenses: Expense[],
  categories: Category[],
): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>()
  for (const cat of categories) {
    map.set(cat.id, {
      categoryId: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      total: 0,
      count: 0,
    })
  }
  for (const e of expenses) {
    const entry = map.get(e.categoryId)
    if (entry) {
      entry.total += e.amount
      entry.count += 1
    } else {
      // Catégorie inconnue (supprimée) -> "Autre"
      const autre = map.get('autre')
      if (autre) {
        autre.total += e.amount
        autre.count += 1
      }
    }
  }
  return [...map.values()]
    .filter((c) => c.count > 0)
    .sort((a, b) => b.total - a.total)
}

/** Évolution mensuelle : 6 derniers mois (clé -> total). */
export function monthlyTrend(expenses: Expense[], months = 6): { key: string; total: number }[] {
  const now = new Date()
  const result: { key: string; total: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    result.push({ key, total: 0 })
  }
  const indexMap = new Map(result.map((r, i) => [r.key, i]))
  for (const e of expenses) {
    const idx = indexMap.get(monthKey(e.date))
    if (idx !== undefined) result[idx].total += e.amount
  }
  return result
}

export interface BudgetStatus {
  budget: Budget
  spent: number
  /** Ratio dépensé / budget (0-1+). */
  ratio: number
  /** 'ok' | 'warning' | 'over' selon le ratio. */
  state: 'ok' | 'warning' | 'over'
}

/** Calcule l'état d'atteinte des budgets pour un mois donné. */
export function budgetStatuses(
  budgets: Budget[],
  monthExpenses: Expense[],
): BudgetStatus[] {
  return budgets.map((budget) => {
    const spent =
      budget.type === 'global'
        ? totalExpenses(monthExpenses)
        : totalExpenses(monthExpenses.filter((e) => e.categoryId === budget.categoryId))
    const ratio = budget.amount > 0 ? spent / budget.amount : 0
    const state: BudgetStatus['state'] = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok'
    return { budget, spent, ratio, state }
  })
}

// ----------------------------------------------------------------------------
// RÉCURRENTS
// ----------------------------------------------------------------------------

export interface RecurringExpense {
  merchant: string
  categoryId: string
  amount: number
  /** Nombre d'occurrences détectées. */
  occurrences: number
  /** Libellé du mois le plus récent. */
  lastMonth: string
}

/**
 * Détecte les dépenses récurrentes : même marchand, même montant (à 1€ près),
 * présent sur au moins 2 des 3 derniers mois.
 */
export function detectRecurring(expenses: Expense[]): RecurringExpense[] {
  const recent = monthlyTrend(expenses, 3).map((m) => m.key)
  // Groupe par marchand normalisé + montant arrondi.
  const groups = new Map<string, Expense[]>()
  for (const e of expenses) {
    if (!recent.includes(monthKey(e.date))) continue
    const key = `${e.merchant.toLowerCase().trim()}|${Math.round(e.amount)}`
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }
  const result: RecurringExpense[] = []
  for (const arr of groups.values()) {
    const monthsWith = new Set(arr.map((e) => monthKey(e.date)))
    if (monthsWith.size >= 2) {
      const last = arr.sort((a, b) => b.date.localeCompare(a.date))[0]
      result.push({
        merchant: last.merchant,
        categoryId: last.categoryId,
        amount: last.amount,
        occurrences: arr.length,
        lastMonth: [...monthsWith].sort().pop()!,
      })
    }
  }
  return result.sort((a, b) => b.occurrences - a.occurrences)
}

/** Résumé textuel de la semaine. */
export function weeklySummary(expenses: Expense[], categories: Category[]): string {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekExpenses = expenses.filter((e) => new Date(e.date + 'T00:00:00') >= weekAgo)
  const total = totalExpenses(weekExpenses)
  if (total === 0) return "Aucune dépense cette semaine."
  const byCat = totalsByCategory(weekExpenses, categories)
  const top = byCat[0]
  return `Cette semaine : ${formatEUR(total)} dépensés${
    top ? `, principalement en ${top.name}` : ''
  }.`
}
