import { useCallback, useState } from 'react'

export type Page = 'dashboard' | 'add' | 'history' | 'budgets' | 'settings'

/**
 * Navigation simple basée sur l'état local.
 * Évite d'ajouter react-router pour garder l'app légère et 100% offline.
 */
export function useNavigation(initial: Page = 'dashboard') {
  const [page, setPage] = useState<Page>(initial)

  /** Params optionnels transmis à la page (ex: dépense à éditer). */
  const [params, setParams] = useState<Record<string, unknown>>({})

  const navigate = useCallback((next: Page, nextParams: Record<string, unknown> = {}) => {
    setPage(next)
    setParams(nextParams)
    window.scrollTo({ top: 0 })
  }, [])

  return { page, params, navigate }
}
