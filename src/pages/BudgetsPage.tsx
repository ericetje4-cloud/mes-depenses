import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, Input, Label, Modal, ProgressBar, Select } from '../components/ui'
import { Icon } from '../components/Icon'
import {
  budgetStatuses,
  currentMonthKey,
  expensesByMonth,
  formatEUR,
  totalExpenses,
} from '../lib/format'
import { uid } from '../lib/store-utils'
import type { Budget, Category, Expense } from '../types'

export function BudgetsPage({
  expenses,
  categories,
  budgets,
  onSave,
  onDelete,
}: {
  expenses: Expense[]
  categories: Category[]
  budgets: Budget[]
  onSave: (b: Budget) => void
  onDelete: (id: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<'global' | 'category'>('global')
  const [formCategory, setFormCategory] = useState(categories[0]?.id ?? 'autre')
  const [formAmount, setFormAmount] = useState('')

  const curKey = currentMonthKey()
  const monthExpenses = expensesByMonth(expenses, curKey)
  const statuses = budgetStatuses(budgets, monthExpenses)
  const globalSpent = totalExpenses(monthExpenses)

  function handleSave() {
    const amount = parseFloat(formAmount.replace(',', '.'))
    if (!amount || amount <= 0) return
    const budget: Budget = {
      id: uid(),
      type: formType,
      categoryId: formType === 'category' ? formCategory : undefined,
      amount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    onSave(budget)
    setShowForm(false)
    setFormAmount('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Budgets</h1>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} />
          Budget
        </Button>
      </div>

      {statuses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="PiggyBank" size={40} />}
            title="Aucun budget défini"
            description="Fixez un plafond mensuel global ou par catégorie pour suivre vos dépenses."
            action={
              <Button onClick={() => setShowForm(true)}>
                <Plus size={18} />
                Créer un budget
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {statuses.map(({ budget, spent, ratio, state }) => {
            const name =
              budget.type === 'global'
                ? 'Budget global'
                : categories.find((c) => c.id === budget.categoryId)?.name ?? 'Catégorie'
            const color =
              budget.type === 'category'
                ? categories.find((c) => c.id === budget.categoryId)?.color
                : undefined
            return (
              <Card key={budget.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {color && (
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{name}</p>
                      <p className="text-xs text-slate-400">
                        {formatEUR(spent)} / {formatEUR(budget.amount)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(budget.id)}
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-3">
                  <ProgressBar ratio={ratio} state={state} />
                  <p className="mt-1.5 text-right text-xs font-medium text-slate-400">
                    {Math.round(ratio * 100)}%
                    {state === 'over'
                      ? ' · dépassé'
                      : state === 'warning'
                        ? ' · attention'
                        : ''}
                  </p>
                </div>
              </Card>
            )
          })}

          {/* Récap global */}
          <Card className="bg-slate-50 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Dépensé ce mois-ci (toutes catégories)
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {formatEUR(globalSpent)}
            </p>
          </Card>
        </div>
      )}

      {/* Formulaire d'ajout */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nouveau budget">
        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <Select value={formType} onChange={(e) => setFormType(e.target.value as 'global' | 'category')}>
              <option value="global">Budget global</option>
              <option value="category">Par catégorie</option>
            </Select>
          </div>
          {formType === 'category' && (
            <div>
              <Label>Catégorie</Label>
              <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Montant mensuel (€)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="200"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={!formAmount}>
              Créer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
