import { useMemo, useState } from 'react'
import { Download, Pencil, Search } from 'lucide-react'
import { Button, Card, EmptyState, Input, Select } from '../components/ui'
import { Icon } from '../components/Icon'
import { exportCSV } from '../lib/export'
import { formatDate, formatEUR } from '../lib/format'
import type { Category, Expense } from '../types'

type SortMode = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

export function HistoryPage({
  expenses,
  categories,
  onEdit,
}: {
  expenses: Expense[]
  categories: Category[]
  onEdit: (e: Expense) => void
}) {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState<SortMode>('date-desc')

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  const filtered = useMemo(() => {
    let list = expenses
    if (categoryFilter !== 'all') {
      list = list.filter((e) => e.categoryId === categoryFilter)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (e) =>
          e.merchant.toLowerCase().includes(q) ||
          (e.note?.toLowerCase().includes(q) ?? false),
      )
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.date.localeCompare(b.date) || a.createdAt - b.createdAt
        case 'amount-desc':
          return b.amount - a.amount
        case 'amount-asc':
          return a.amount - b.amount
        default:
          return b.date.localeCompare(a.date) || b.createdAt - a.createdAt
      }
    })
    return sorted
  }, [expenses, query, categoryFilter, sort])

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Historique</h1>
        <Button
          variant="secondary"
          onClick={() => exportCSV(filtered, categories)}
          disabled={filtered.length === 0}
        >
          <Download size={16} />
          CSV
        </Button>
      </div>

      {/* Filtres */}
      <div className="space-y-2">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="date-desc">Plus récentes</option>
            <option value="date-asc">Plus anciennes</option>
            <option value="amount-desc">Montant ↓</option>
            <option value="amount-asc">Montant ↑</option>
          </Select>
        </div>
      </div>

      {/* Compteur */}
      <p className="px-1 text-sm text-slate-500 dark:text-slate-400">
        {filtered.length} dépense(s) · {formatEUR(totalFiltered)}
      </p>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="History" size={40} />}
            title="Aucune dépense"
            description={query || categoryFilter !== 'all' ? 'Aucun résultat pour ces filtres.' : 'Ajoutez votre première dépense.'}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const cat = catById.get(e.categoryId)
            return (
              <button
                key={e.id}
                onClick={() => onEdit(e)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-indigo-300 active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: cat?.color ?? '#64748b' }}
                >
                  <Icon name={cat?.icon ?? 'Circle'} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                    {e.merchant}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDate(e.date)} · {cat?.name ?? 'Autre'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {formatEUR(e.amount)}
                  </span>
                  <Pencil size={15} className="text-slate-300 dark:text-slate-600" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
