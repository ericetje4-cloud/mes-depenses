// ===========================================================================
// Page Dépenses récurrentes : abonnements détectés automatiquement + vue
// des prélèvements à venir.
// ===========================================================================

import { useMemo } from 'react';
import { Repeat, CalendarClock, TrendingUp } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { Layout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/ui';
import { detectRecurring } from '@/lib/store-utils';
import { formatEUR, formatDate, formatRelative, todayISO } from '@/lib/format';

export function RecurringPage() {
  const { transactions, categories } = useStore();

  const recurring = useMemo(
    () => detectRecurring(transactions),
    [transactions],
  );

  // Sépare à venir (futur ou proche) et passés.
  const today = todayISO();
  const upcoming = recurring.filter((r) => r.nextDate >= today);
  const recent = recurring.filter((r) => r.nextDate < today);

  // Total mensuel estimé des récurrents.
  const monthlyEstimate = useMemo(
    () =>
      recurring.reduce(
        (sum, r) => sum + (r.averageAmount * 30) / r.intervalDays,
        0,
      ),
    [recurring],
  );

  return (
    <Layout title="Récurrents">
      {recurring.length > 0 && (
        <div className="mb-4 card bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
          <p className="flex items-center gap-1.5 text-sm text-white/80">
            <TrendingUp size={15} /> Estimation mensuelle
          </p>
          <p className="mt-0.5 text-2xl font-bold">{formatEUR(monthlyEstimate)}</p>
          <p className="text-xs text-white/70">
            {recurring.length} abonnement{recurring.length > 1 ? 's' : ''} détecté{recurring.length > 1 ? 's' : ''}
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-500">
            <CalendarClock size={15} /> À venir
          </h2>
          <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
            {upcoming.map((r) => {
              const cat = categories.find((c) => c.id === r.categoryId);
              return (
                <li key={r.merchant} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: cat?.color ?? '#64748b' }}
                  >
                    <Icon name={cat?.icon ?? 'Repeat'} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.merchantLabel}</p>
                    <p className="text-xs text-slate-400">
                      Tous les {r.intervalDays} j · {r.occurrences} occurrences
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      ~{formatEUR(r.averageAmount)}
                    </p>
                    <p className="text-xs text-brand-600 dark:text-brand-400">
                      {formatRelative(r.nextDate)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-500">
            <Repeat size={15} /> En retard (échéance dépassée)
          </h2>
          <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((r) => {
              const cat = categories.find((c) => c.id === r.categoryId);
              return (
                <li key={r.merchant} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: cat?.color ?? '#64748b' }}
                  >
                    <Icon name={cat?.icon ?? 'Repeat'} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.merchantLabel}</p>
                    <p className="text-xs text-slate-400">
                      Échéance {formatDate(r.nextDate)}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-slate-500">
                    ~{formatEUR(r.averageAmount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {recurring.length === 0 && (
        <EmptyState
          icon="Repeat"
          title="Aucun abonnement détecté"
          description="L'application détecte automatiquement les dépenses récurrentes (même marchand, même montant, intervalle régulier). Ajoutez quelques dépenses récurrentes pour les voir apparaître ici."
        />
      )}
    </Layout>
  );
}
