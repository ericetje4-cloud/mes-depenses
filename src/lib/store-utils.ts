// ===========================================================================
// Sélecteurs purs : calculs dérivés à partir de l'état du store.
// Aucun effet de bord, aucun accès DB : fonctions pures consommées par l'UI.
// ===========================================================================

import type {
  Budget,
  Category,
  RecurringExpense,
  Transaction,
} from '@/types';
import {
  monthKey,
  monthRange,
  parseISO,
  shiftMonth,
  todayISO,
  toISODate,
} from '@/lib/format';
import { normalizeMerchant } from '@/hooks/useStore';

// ---------------------------------------------------------------------------
// Filtrage
// ---------------------------------------------------------------------------

export interface TransactionFilter {
  categoryId?: string;
  startDate?: string; // ISO inclus
  endDate?: string; // ISO inclus
  minAmount?: number;
  maxAmount?: number;
  search?: string; // recherche textuelle sur merchant + note
  monthKey?: string; // YYYY-MM
}

export function filterTransactions(
  transactions: Transaction[],
  filter: TransactionFilter,
): Transaction[] {
  const search = filter.search?.trim().toLowerCase();

  return transactions.filter((t) => {
    if (filter.categoryId && t.categoryId !== filter.categoryId) return false;
    if (filter.monthKey && monthKey(t.date) !== filter.monthKey) return false;
    if (filter.startDate && t.date < filter.startDate) return false;
    if (filter.endDate && t.date > filter.endDate) return false;
    if (filter.minAmount !== undefined && t.amount < filter.minAmount)
      return false;
    if (filter.maxAmount !== undefined && t.amount > filter.maxAmount)
      return false;
    if (search) {
      const haystack = `${t.merchant} ${t.note ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Totaux
// ---------------------------------------------------------------------------

/** Somme des montants d'une liste de transactions. */
export function sumAmount(transactions: Transaction[]): number {
  return transactions.reduce((acc, t) => acc + t.amount, 0);
}

/** Total dépensé pour un mois donné (YYYY-MM). */
export function totalForMonth(
  transactions: Transaction[],
  mKey: string,
): number {
  return sumAmount(
    transactions.filter((t) => monthKey(t.date) === mKey),
  );
}

/** Variation en % entre deux totaux. positive = hausse. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // undefined si base nulle
  return ((current - previous) / previous) * 100;
}

// ---------------------------------------------------------------------------
// Répartition par catégorie (pour camembert)
// ---------------------------------------------------------------------------

export interface CategorySlice {
  categoryId: string;
  label: string;
  color: string;
  icon: string;
  amount: number;
  /** Part en % (0-100). */
  percent: number;
  count: number;
}

export function breakdownByCategory(
  transactions: Transaction[],
  categories: Category[],
): CategorySlice[] {
  const total = sumAmount(transactions);
  const byCat = new Map<string, { amount: number; count: number }>();

  for (const t of transactions) {
    const entry = byCat.get(t.categoryId) ?? { amount: 0, count: 0 };
    entry.amount += t.amount;
    entry.count += 1;
    byCat.set(t.categoryId, entry);
  }

  const slices: CategorySlice[] = [];
  for (const [categoryId, { amount, count }] of byCat) {
    const cat = categories.find((c) => c.id === categoryId);
    slices.push({
      categoryId,
      label: cat?.label ?? 'Inconnu',
      color: cat?.color ?? '#64748b',
      icon: cat?.icon ?? 'Circle',
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
      count,
    });
  }

  return slices.sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Évolution sur N mois (pour barres / courbe)
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  monthKey: string;
  label: string; // "Juil."
  amount: number;
}

import { monthShortLabel } from '@/lib/format';

/** Évolution des dépenses sur les `count` derniers mois (incluant ce mois-ci). */
export function monthlyTrend(
  transactions: Transaction[],
  count: number,
): MonthlyPoint[] {
  const current = monthKey(todayISO());
  const points: MonthlyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = shiftMonth(current, -i);
    points.push({
      monthKey: key,
      label: monthShortLabel(key),
      amount: totalForMonth(transactions, key),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export type BudgetStatus = 'ok' | 'warning' | 'danger' | 'over';

export interface BudgetProgress {
  budget?: Budget;
  spent: number;
  amount: number;
  /** Progression 0-1 (peut dépasser 1 si dépassement). */
  progress: number;
  status: BudgetStatus;
  label: string;
  color: string;
}

const STATUS_THRESHOLDS = { warning: 0.8, danger: 1 };

function statusFor(progress: number): BudgetStatus {
  if (progress >= 1) return 'over';
  if (progress >= STATUS_THRESHOLDS.danger) return 'danger';
  if (progress >= STATUS_THRESHOLDS.warning) return 'warning';
  return 'ok';
}

/** Couleur associée à un statut (hex pour Recharts/Tailwind). */
export function statusColor(status: BudgetStatus): string {
  switch (status) {
    case 'ok':
      return '#22c55e';
    case 'warning':
      return '#f59e0b';
    case 'danger':
      return '#ef4444';
    case 'over':
      return '#dc2626';
  }
}

/** Progression du budget global pour le mois courant. */
export function globalBudgetProgress(
  transactions: Transaction[],
  budgets: Budget[],
): BudgetProgress {
  const mKey = monthKey(todayISO());
  const { start, end } = monthRange(mKey);
  const monthTx = transactions.filter(
    (t) => t.date >= start && t.date <= end,
  );
  const spent = sumAmount(monthTx);
  const budget = budgets.find((b) => b.scope === 'global');
  const amount = budget?.amount ?? 0;
  const progress = amount > 0 ? spent / amount : 0;

  return {
    budget,
    spent,
    amount,
    progress,
    status: amount > 0 ? statusFor(progress) : 'ok',
    label: 'Budget global',
    color: statusColor(amount > 0 ? statusFor(progress) : 'ok'),
  };
}

/** Progression de tous les budgets actifs (global + par catégorie). */
export function allBudgetsProgress(
  transactions: Transaction[],
  budgets: Budget[],
  categories: Category[],
): BudgetProgress[] {
  const mKey = monthKey(todayISO());
  const { start, end } = monthRange(mKey);
  const monthTx = transactions.filter(
    (t) => t.date >= start && t.date <= end,
  );

  return budgets
    .map((budget) => {
      const spent =
        budget.scope === 'global'
          ? sumAmount(monthTx)
          : sumAmount(monthTx.filter((t) => t.categoryId === budget.categoryId));
      const progress = budget.amount > 0 ? spent / budget.amount : 0;
      const status = statusFor(progress);
      const cat = categories.find((c) => c.id === budget.categoryId);

      return {
        budget,
        spent,
        amount: budget.amount,
        progress,
        status,
        label:
          budget.scope === 'global'
            ? 'Budget global'
            : cat?.label ?? 'Catégorie',
        color: statusColor(status),
      };
    })
    .sort((a, b) => b.progress - a.progress);
}

// ---------------------------------------------------------------------------
// Détection des dépenses récurrentes (abonnements)
// ---------------------------------------------------------------------------

/**
 * Détecte les dépenses récurrentes : même marchand normalisé, montant proche
 * (±10%), au moins 2 occurrences, et espacement régulier (intervalle stable).
 */
export function detectRecurring(
  transactions: Transaction[],
): RecurringExpense[] {
  // Groupe par marchand normalisé.
  const byMerchant = new Map<
    string,
    { tx: Transaction; label: string; catId: string }[]
  >();

  for (const t of transactions) {
    const key = normalizeMerchant(t.merchant);
    if (!key) continue;
    const arr = byMerchant.get(key) ?? [];
    arr.push({ tx: t, label: t.merchant, catId: t.categoryId });
    byMerchant.set(key, arr);
  }

  const result: RecurringExpense[] = [];

  for (const [merchant, items] of byMerchant) {
    if (items.length < 2) continue;

    // Tri par date croissante.
    items.sort((a, b) => a.tx.date.localeCompare(b.tx.date));

    // Montant moyen.
    const amounts = items.map((i) => i.tx.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // Vérifie la stabilité des montants (écart < 10% de la moyenne).
    const stableAmount = amounts.every(
      (a) => Math.abs(a - avgAmount) / Math.max(avgAmount, 0.01) < 0.1,
    );
    if (!stableAmount) continue;

    // Intervalles en jours entre occurrences.
    const intervals: number[] = [];
    for (let i = 1; i < items.length; i++) {
      const d0 = parseISO(items[i - 1].tx.date);
      const d1 = parseISO(items[i].tx.date);
      if (d0 && d1) {
        intervals.push(
          Math.round((d1.getTime() - d0.getTime()) / 86_400_000),
        );
      }
    }
    if (intervals.length === 0) continue;

    const avgInterval =
      intervals.reduce((a, b) => a + b, 0) / intervals.length;
    // Intervalles stables (écart < 5 jours) et plausibles (7-45j ~ mensuel/bimensuel).
    const intervalStable =
      avgInterval >= 7 &&
      avgInterval <= 45 &&
      intervals.every((iv) => Math.abs(iv - avgInterval) < 7);
    if (!intervalStable) continue;

    const last = items[items.length - 1];
    const lastDate = parseISO(last.tx.date);
    if (!lastDate) continue;

    // Prochaine échéance estimée.
    const next = new Date(lastDate.getTime() + avgInterval * 86_400_000);

    result.push({
      merchant,
      merchantLabel: last.label,
      categoryId: last.catId,
      averageAmount: avgAmount,
      occurrences: items.length,
      intervalDays: Math.round(avgInterval),
      nextDate: toISODate(next),
      lastDate: last.tx.date,
    });
  }

  // Trier par prochaine échéance.
  return result.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

// ---------------------------------------------------------------------------
// Résumé hebdomadaire textuel
// ---------------------------------------------------------------------------

export interface WeeklySummary {
  total: number;
  /** Catégorie dominante (la plus dépensée), ou null. */
  topCategory: { label: string; amount: number } | null;
  /** Nombre de transactions. */
  count: number;
  /** Phrase prête à afficher. */
  text: string;
}

/** Calcule le résumé de la semaine écoulée (7 derniers jours). */
export function weeklySummary(
  transactions: Transaction[],
  categories: Category[],
): WeeklySummary {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const startISO = toISODate(weekAgo);

  const weekTx = transactions.filter((t) => t.date >= startISO);
  const total = sumAmount(weekTx);

  const slices = breakdownByCategory(weekTx, categories);
  const top = slices[0];

  const text = top
    ? `Cette semaine : ${total.toFixed(2)} € dépensés, principalement en ${top.label} (${top.amount.toFixed(2)} €).`
    : weekTx.length > 0
      ? `Cette semaine : ${total.toFixed(2)} € dépensés.`
      : 'Aucune dépense cette semaine.';

  return {
    total,
    topCategory: top ? { label: top.label, amount: top.amount } : null,
    count: weekTx.length,
    text,
  };
}
