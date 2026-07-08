import { useCallback, useEffect, useState } from 'react'
import * as db from '../lib/db'
import { learnMerchantFromExpense } from '../lib/store-utils'
import type { Budget, Category, Expense } from '../types'

/**
 * Hook central : charge et expose toutes les données, et fournit
 * les actions CRUD qui rechargent automatiquement l'état.
 */
export function useStore() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [exp, cat, bud] = await Promise.all([
      db.getAllExpenses(),
      db.getAllCategories(),
      db.getAllBudgets(),
    ])
    setExpenses(exp)
    setCategories(cat)
    setBudgets(bud)
  }, [])

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [reload])

  // --- Dépenses ---

  const addExpense = useCallback(
    async (expense: Expense) => {
      await db.saveExpense(expense)
      // Apprentissage local : associer le marchand à sa catégorie.
      await learnMerchantFromExpense(expense)
      await reload()
    },
    [reload],
  )

  const updateExpense = useCallback(
    async (expense: Expense) => {
      await db.saveExpense(expense)
      await learnMerchantFromExpense(expense)
      await reload()
    },
    [reload],
  )

  const removeExpense = useCallback(
    async (id: string) => {
      await db.deleteExpense(id)
      await reload()
    },
    [reload],
  )

  // --- Catégories ---

  const addCategory = useCallback(
    async (category: Category) => {
      await db.saveCategory(category)
      await reload()
    },
    [reload],
  )

  const removeCategory = useCallback(
    async (id: string) => {
      await db.deleteCategory(id)
      await reload()
    },
    [reload],
  )

  // --- Budgets ---

  const saveBudget = useCallback(
    async (budget: Budget) => {
      await db.saveBudget(budget)
      await reload()
    },
    [reload],
  )

  const removeBudget = useCallback(
    async (id: string) => {
      await db.deleteBudget(id)
      await reload()
    },
    [reload],
  )

  return {
    expenses,
    categories,
    budgets,
    loading,
    reload,
    addExpense,
    updateExpense,
    removeExpense,
    addCategory,
    removeCategory,
    saveBudget,
    removeBudget,
  }
}
