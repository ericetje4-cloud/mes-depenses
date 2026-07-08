import type { ReactNode } from 'react'
import { BarChart3, Plus, History, PiggyBank, Settings } from 'lucide-react'
import type { Page } from '../hooks/useNavigation'

const TABS: { id: Page; label: string; icon: typeof BarChart3 }[] = [
  { id: 'dashboard', label: 'Tableau', icon: BarChart3 },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'budgets', label: 'Budgets', icon: PiggyBank },
  { id: 'settings', label: 'Réglages', icon: Settings },
]

export function Layout({
  page,
  onNavigate,
  onAdd,
  children,
}: {
  page: Page
  onNavigate: (p: Page) => void
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col bg-slate-50 dark:bg-slate-950">
      {/* Contenu */}
      <main className="flex-1 px-4 pb-28 pt-5 sm:px-6">{children}</main>

      {/* Barre de navigation flottante */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {TABS.slice(0, 2).map((t) => (
            <NavButton key={t.id} tab={t} active={page === t.id} onClick={() => onNavigate(t.id)} />
          ))}

          {/* Bouton central d'ajout */}
          <button
            onClick={onAdd}
            aria-label="Ajouter une dépense"
            className="-mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-700 active:scale-95"
          >
            <Plus size={26} />
          </button>

          {TABS.slice(2).map((t) => (
            <NavButton key={t.id} tab={t} active={page === t.id} onClick={() => onNavigate(t.id)} />
          ))}
        </div>
      </nav>
    </div>
  )
}

function NavButton({
  tab,
  active,
  onClick,
}: {
  tab: { id: Page; label: string; icon: typeof BarChart3 }
  active: boolean
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
        active
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
      }`}
    >
      <Icon size={22} />
      {tab.label}
    </button>
  )
}
