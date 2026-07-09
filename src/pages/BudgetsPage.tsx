// ===========================================================================
// Page Budgets : budget mensuel global ou par catégorie, avec barres de
// progression dynamiques (vert → orange → rouge en cas de dépassement).
// ===========================================================================

import { useMemo, useState } from 'react';
import { Plus, PiggyBank, Target } from 'lucide-react';
import {
  useStore,
  setBudget,
  removeBudget,
} from '@/hooks/useStore';
import { Layout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import {
  Field,
  Modal,
  ProgressBar,
  EmptyState,
  ConfirmDialog,
  useToast,
} from '@/components/ui';
import { allBudgetsProgress, type BudgetStatus } from '@/lib/store-utils';
import { formatEUR, monthLabel, monthKey, todayISO } from '@/lib/format';
import type { BudgetScope } from '@/types';

export function BudgetsPage() {
  const { transactions, categories, budgets } = useStore();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const progress = useMemo(
    () => allBudgetsProgress(transactions, budgets, categories),
    [transactions, budgets, categories],
  );

  const mLabel = monthLabel(monthKey(todayISO()));

  return (
    <Layout
      title="Budgets"
      actions={
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"
          aria-label="Ajouter un budget"
        >
          <Plus size={20} />
        </button>
      }
    >
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Target size={15} /> Progression pour {mLabel}
      </div>

      {progress.length > 0 ? (
        <div className="space-y-3">
          {progress.map((p) => {
            const cat = categories.find(
              (c) => c.id === p.budget?.categoryId,
            );
            const isOver = p.status === 'over';
            return (
              <div key={p.budget!.id} className="card p-4">
                <div className="mb-2 flex items-center gap-3">
                  {cat ? (
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: cat.color }}
                    >
                      <Icon name={cat.icon} size={16} />
                    </span>
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
                      <PiggyBank size={16} />
                    </span>
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{p.label}</p>
                    <p className="text-xs text-slate-400">
                      {formatEUR(p.spent)} / {formatEUR(p.amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold ${overColor(p.status)}`}
                    >
                      {Math.round(p.progress * 100)}%
                    </p>
                    <button
                      onClick={() => setDeleting(p.budget!.id)}
                      className="text-xs text-slate-300 hover:text-red-500"
                    >
                      supprimer
                    </button>
                  </div>
                </div>
                <ProgressBar value={p.progress} status={p.status} />
                {isOver && (
                  <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                    Budget dépassé de {formatEUR(p.spent - p.amount)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="Target"
          title="Aucun budget défini"
          description="Fixez un plafond mensuel pour suivre vos dépenses et être alerté en cas de dépassement."
          action={
            <button onClick={() => setShowForm(true)} className="btn-primary mt-2">
              <Plus size={16} /> Créer un budget
            </button>
          }
        />
      )}

      {showForm && (
        <BudgetForm
          categories={categories}
          existing={budgets}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            toast('Budget enregistré ✓', 'success');
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Supprimer le budget ?"
        message="Vous pourrez le recréer à tout moment."
        confirmLabel="Supprimer"
        danger
        onConfirm={async () => {
          if (deleting) {
            await removeBudget(deleting);
            toast('Budget supprimé', 'info');
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </Layout>
  );
}

function overColor(status: BudgetStatus): string {
  switch (status) {
    case 'ok':
      return 'text-green-600 dark:text-green-400';
    case 'warning':
      return 'text-amber-600 dark:text-amber-400';
    case 'danger':
    case 'over':
      return 'text-red-600 dark:text-red-400';
  }
}

// ---------------------------------------------------------------------------
// Formulaire de création / édition de budget
// ---------------------------------------------------------------------------

function BudgetForm({
  categories,
  existing,
  onClose,
  onSaved,
}: {
  categories: ReturnType<typeof useStore>['categories'];
  existing: ReturnType<typeof useStore>['budgets'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<BudgetScope>('global');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [amount, setAmount] = useState('');

  // Catégories qui n'ont pas encore de budget.
  const availableCats = categories.filter(
    (c) => !existing.some((b) => b.categoryId === c.id),
  );
  const hasGlobal = existing.some((b) => b.scope === 'global');

  async function save() {
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;
    if (scope === 'category' && !categoryId) return;
    if (scope === 'global' && hasGlobal) {
      // Édite le budget global existant.
      await setBudget('global', amountNum);
    } else {
      await setBudget(
        scope,
        amountNum,
        scope === 'category' ? categoryId : undefined,
      );
    }
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau budget"
      footer={
        <>
          <button className="btn-secondary flex-1" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary flex-1" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setScope('global')}
            className={`rounded-xl border p-3 text-sm font-medium ${
              scope === 'global'
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <PiggyBank size={18} className="mb-1" />
            Global
            {hasGlobal && (
              <span className="mt-1 block text-[10px] text-slate-400">(écrase l'existant)</span>
            )}
          </button>
          <button
            onClick={() => setScope('category')}
            disabled={availableCats.length === 0}
            className={`rounded-xl border p-3 text-sm font-medium disabled:opacity-40 ${
              scope === 'category'
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <Target size={18} className="mb-1" />
            Par catégorie
          </button>
        </div>

        {scope === 'category' && (
          <Field label="Catégorie" required>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {availableCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Montant mensuel (€)" required>
          <input
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="ex. 300"
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}
