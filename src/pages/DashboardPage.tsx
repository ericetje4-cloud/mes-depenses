// ===========================================================================
// Page Tableau de bord : vue d'ensemble mensuelle.
// ===========================================================================

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Calendar, Plus, Receipt } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { navigateTo } from '@/hooks/useNavigation';
import { Layout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { CategoryPieChart, MonthlyBarChart } from '@/components/Charts';
import { EmptyState } from '@/components/ui';
import {
  breakdownByCategory,
  monthlyTrend,
  percentChange,
  totalForMonth,
  weeklySummary,
} from '@/lib/store-utils';
import {
  formatEUR,
  formatDate,
  monthKey,
  shiftMonth,
  todayISO,
} from '@/lib/format';

export function DashboardPage() {
  const { transactions, categories } = useStore();

  const currentMonth = monthKey(todayISO());
  const prevMonth = shiftMonth(currentMonth, -1);

  const total = useMemo(
    () => totalForMonth(transactions, currentMonth),
    [transactions, currentMonth],
  );
  const prevTotal = useMemo(
    () => totalForMonth(transactions, prevMonth),
    [transactions, prevMonth],
  );
  const variation = percentChange(total, prevTotal);

  const slices = useMemo(
    () =>
      breakdownByCategory(
        transactions.filter((t) => monthKey(t.date) === currentMonth),
        categories,
      ),
    [transactions, categories, currentMonth],
  );

  const trend = useMemo(
    () => monthlyTrend(transactions, 6),
    [transactions],
  );

  const summary = useMemo(
    () => weeklySummary(transactions, categories),
    [transactions, categories],
  );

  const recent = useMemo(
    () => transactions.slice(0, 5),
    [transactions],
  );

  return (
    <Layout
      title="Tableau de bord"
      actions={
        <button
          onClick={() => navigateTo('add')}
          className="rounded-lg bg-brand-600 p-2 text-white hover:bg-brand-700 sm:hidden"
          aria-label="Ajouter"
        >
          <Plus size={18} />
        </button>
      }
    >
      <div className="space-y-5">
        {/* Raccourcis rapides */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigateTo('recurring')}
            className="card flex items-center gap-3 p-4 text-left transition-transform active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400">
              <Icon name="Repeat" size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold">Abonnements</p>
              <p className="text-xs text-slate-400">Récurrents détectés</p>
            </div>
          </button>
          <button
            onClick={() => navigateTo('budgets')}
            className="card flex items-center gap-3 p-4 text-left transition-transform active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
              <Icon name="PiggyBank" size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold">Budgets</p>
              <p className="text-xs text-slate-400">Suivi mensuel</p>
            </div>
          </button>
        </div>

        {/* Carte total du mois */}
        <section className="card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
            <p className="flex items-center gap-1.5 text-sm text-white/80">
              <Calendar size={15} /> Dépenses ce mois-ci
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight">
              {formatEUR(total)}
            </p>
            {variation !== null && (
              <div className="mt-2 flex items-center gap-1.5 text-sm">
                {variation >= 0 ? (
                  <TrendingUp size={15} className="text-red-200" />
                ) : (
                  <TrendingDown size={15} className="text-green-200" />
                )}
                <span className={variation >= 0 ? 'text-red-200' : 'text-green-200'}>
                  {variation >= 0 ? '+' : ''}
                  {variation.toFixed(1)}%
                </span>
                <span className="text-white/60">vs mois dernier</span>
              </div>
            )}
          </div>
        </section>

        {/* Résumé hebdomadaire */}
        <section className="card p-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">{summary.text}</p>
        </section>

        {/* Répartition par catégorie */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            Répartition par catégorie
          </h2>
          {slices.length > 0 ? (
            <>
              <CategoryPieChart data={slices} />
              <div className="mt-4 space-y-2">
                {slices.slice(0, 5).map((s) => (
                  <div
                    key={s.categoryId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                    </span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-300">
                      {formatEUR(s.amount)} · {s.percent.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon="PieChart"
              title="Aucune dépense ce mois-ci"
              description="Ajoutez votre première dépense pour voir la répartition."
              action={
                <button onClick={() => navigateTo('add')} className="btn-primary mt-2">
                  <Plus size={16} /> Ajouter une dépense
                </button>
              }
            />
          )}
        </section>

        {/* Évolution 6 mois */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            Évolution (6 derniers mois)
          </h2>
          <MonthlyBarChart data={trend} />
        </section>

        {/* Dernières transactions */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">
              Dernières dépenses
            </h2>
            <button
              onClick={() => navigateTo('history')}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Tout voir
            </button>
          </div>
          {recent.length > 0 ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((t) => {
                const cat = categories.find((c) => c.id === t.categoryId);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: cat?.color ?? '#64748b' }}
                    >
                      <CategoryBadgeMini icon={cat?.icon} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.merchant}</p>
                      <p className="text-xs text-slate-400">{formatDate(t.date)}</p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      −{formatEUR(t.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon="Receipt"
              title="Aucune dépense"
              description="Commencez par scanner un ticket ou ajouter une dépense."
              action={
                <button onClick={() => navigateTo('add')} className="btn-primary mt-2">
                  <Receipt size={16} /> Scanner un ticket
                </button>
              }
            />
          )}
        </section>
      </div>
    </Layout>
  );
}

function CategoryBadgeMini({ icon }: { icon?: string }) {
  return <Icon name={icon ?? 'Circle'} size={16} />;
}
