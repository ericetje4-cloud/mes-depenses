import { useState } from 'react'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { BudgetsPage } from './pages/BudgetsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AddPage } from './pages/AddPage'
import { useStore } from './hooks/useStore'
import { useTheme } from './hooks/useTheme'
import { useNavigation } from './hooks/useNavigation'
import type { Expense } from './types'

export default function App() {
  const { theme, toggle } = useTheme()
  const store = useStore()
  const { page, navigate } = useNavigation('dashboard')

  // L'écran "Ajouter" est une surcouche (modal-like plein écran) plutôt qu'un onglet.
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Expense | undefined>(undefined)

  function openAdd() {
    setEditing(undefined)
    setAdding(true)
  }

  function openEdit(expense: Expense) {
    setEditing(expense)
    setAdding(true)
  }

  function closeAdd() {
    setAdding(false)
    setEditing(undefined)
  }

  async function handleSave(expense: Expense) {
    await store.addExpense(expense)
    closeAdd()
  }

  async function handleDelete(id: string) {
    await store.removeExpense(id)
    closeAdd()
  }

  // Écran d'ajout/édition en plein écran.
  if (adding) {
    return (
      <div className="min-h-full bg-slate-50 px-4 pb-10 pt-5 dark:bg-slate-950 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <AddPage
            categories={store.categories}
            editing={editing}
            onSave={handleSave}
            onDelete={handleDelete}
            onCancel={closeAdd}
          />
        </div>
      </div>
    )
  }

  // État de chargement initial.
  if (store.loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <Layout page={page} onNavigate={(p) => navigate(p)} onAdd={openAdd}>
      {page === 'dashboard' && (
        <DashboardPage
          expenses={store.expenses}
          categories={store.categories}
          budgets={store.budgets}
        />
      )}
      {page === 'history' && (
        <HistoryPage
          expenses={store.expenses}
          categories={store.categories}
          onEdit={openEdit}
        />
      )}
      {page === 'budgets' && (
        <BudgetsPage
          expenses={store.expenses}
          categories={store.categories}
          budgets={store.budgets}
          onSave={store.saveBudget}
          onDelete={store.removeBudget}
        />
      )}
      {page === 'settings' && (
        <SettingsPage
          categories={store.categories}
          theme={theme}
          onToggleTheme={toggle}
          onAddCategory={store.addCategory}
          onDeleteCategory={store.removeCategory}
          onReload={store.reload}
        />
      )}
    </Layout>
  )
}
