import { ArrowDownRight, ArrowUpRight, CalendarClock } from 'lucide-react'
import { Card, EmptyState } from '../components/ui'
import { Icon } from '../components/Icon'
import { CategoryPieChart, MonthlyBarChart } from '../components/Charts'
import {
  budgetStatuses,
  currentMonthKey,
  detectRecurring,
  expensesByMonth,
  formatEUR,
  monthlyTrend,
  monthLabel,
  previousMonthKey,
  totalExpenses,
  totalsByCategory,
  weeklySummary,
} from '../lib/format'
import type { Budget, Category, Expense } from '../types'

export function DashboardPage({
  expenses,
  categories,
  budgets,
}: {
  expenses: Expense[]
  categories: Category[]
  budgets: Budget[]
}) {
  const curKey = currentMonthKey()
  const prevKey = previousMonthKey()
  const monthExpenses = expensesByMonth(expenses, curKey)
  const prevExpenses = expensesByMonth(expenses, prevKey)

  const total = totalExpenses(monthExpenses)
  const prevTotal = totalExpenses(prevExpenses)
  const diff = total - prevTotal
  const diffPct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0

  const byCat = totalsByCategory(monthExpenses, categories)
  const trend = monthlyTrend(expenses, 6)
  const budgets_state = budgetStatuses(budgets, monthExpenses)
  const recurring = detectRecurring(expenses)
  const summary = weeklySummary(expenses, categories)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold capitalize text-slate-900 dark:text-slate-50">
        {monthLabel(curKey)}
      </h1>

      {/* Total du mois */}
      <Card className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
        <p className="text-sm text-indigo-100">Total dépensé ce mois-ci</p>
        <p className="mt-1 text-4xl font-bold">{formatEUR(total)}</p>
        {prevTotal > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-sm">
            {diff < 0 ? (
              <ArrowDownRight size={16} className="text-green-300" />
            ) : (
              <ArrowUpRight size={16} className="text-amber-200" />
            )}
            <span className="text-indigo-100">
              {diff < 0 ? '−' : '+'}
              {formatEUR(Math.abs(diff))} ({Math.abs(diffPct).toFixed(0)}% vs {monthLabel(prevKey).split(' ')[0]})
            </span>
          </div>
        )}
      </Card>

      {/* Résumé hebdo */}
      <p className="px-1 text-center text-sm text-slate-500 dark:text-slate-400">{summary}</p>

      {/* Budgets en alerte */}
      {budgets_state.some((b) => b.state !== 'ok') && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Budgets à surveiller
          </h2>
          <div className="space-y-2">
            {budgets_state
              .filter((b) => b.state !== 'ok')
              .map((b) => (
                <div key={b.budget.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">
                    {b.budget.type === 'global'
                      ? 'Budget global'
                      : categories.find((c) => c.id === b.budget.categoryId)?.name ?? 'Catégorie'}
                  </span>
                  <span
                    className={
                      b.state === 'over' ? 'font-semibold text-red-500' : 'font-semibold text-amber-500'
                    }
                  >
                    {formatEUR(b.spent)} / {formatEUR(b.budget.amount)}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Répartition par catégorie */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Répartition par catégorie
        </h2>
        {byCat.length === 0 ? (
          <EmptyState
            icon={<Icon name="PieChart" size={40} />}
            title="Aucune dépense ce mois-ci"
            description="Ajoutez votre première dépense pour voir la répartition."
          />
        ) : (
          <>
            <CategoryPieChart data={byCat} />
            <div className="mt-3 space-y-1.5">
              {byCat.slice(0, 5).map((c) => (
                <div key={c.categoryId} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {formatEUR(c.total)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Évolution 6 mois */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Évolution sur 6 mois
        </h2>
        <MonthlyBarChart data={trend} />
      </Card>

      {/* Dépenses récurrentes */}
      {recurring.length > 0 && (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <CalendarClock size={16} />
            Abonnements / dépenses récurrentes
          </h2>
          <div className="space-y-2">
            {recurring.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">{r.merchant}</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {formatEUR(r.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
