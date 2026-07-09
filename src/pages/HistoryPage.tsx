// ===========================================================================
// Page Historique : liste scannable, filtrable (catégorie/date/montant),
// recherche textuelle, export CSV, édition/suppression.
// ===========================================================================

import { useMemo, useState } from 'react';
import {
  Search,
  Download,
  Pencil,
  Trash2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useStore, removeTransaction, updateTransaction } from '@/hooks/useStore';
import { Layout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { Field, EmptyState, ConfirmDialog, Modal, useToast } from '@/components/ui';
import { filterTransactions } from '@/lib/store-utils';
import { exportTransactionsCSV } from '@/lib/export';
import { formatEUR, formatDate, monthKey, monthLabel } from '@/lib/format';
import type { Transaction } from '@/types';

export function HistoryPage() {
  const { transactions, categories } = useStore();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const filtered = useMemo(
    () =>
      filterTransactions(transactions, {
        search,
        categoryId: filterCat || undefined,
        monthKey: filterMonth || undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      }),
    [transactions, search, filterCat, filterMonth, minAmount, maxAmount],
  );

  // Mois disponibles (pour le filtre), triés décroissant.
  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => monthKey(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const total = filtered.reduce((acc, t) => acc + t.amount, 0);

  function handleExport() {
    if (filtered.length === 0) return toast('Rien à exporter.', 'warning');
    exportTransactionsCSV(filtered, categories);
    toast(`${filtered.length} dépenses exportées en CSV ✓`, 'success');
  }

  const hasFilters = !!(search || filterCat || filterMonth || minAmount || maxAmount);

  return (
    <Layout title="Historique">
      {/* Barre de recherche + actions */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-10"
            placeholder="Rechercher un marchand…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`btn-secondary ${showFilters || hasFilters ? 'border-brand-500 text-brand-600' : ''}`}
          aria-label="Filtres"
        >
          <SlidersHorizontal size={18} />
        </button>
        <button onClick={handleExport} className="btn-secondary" aria-label="Exporter">
          <Download size={18} />
        </button>
      </div>

      {/* Panneau de filtres */}
      {showFilters && (
        <div className="card mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie">
              <select
                className="input"
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
              >
                <option value="">Toutes</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mois">
              <select
                className="input"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
              >
                <option value="">Tous</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Montant min (€)">
              <input
                className="input"
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Montant max (€)">
              <input
                className="input"
                inputMode="decimal"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="∞"
              />
            </Field>
          </div>
          {hasFilters && (
            <button
              onClick={() => {
                setFilterCat('');
                setFilterMonth('');
                setMinAmount('');
                setMaxAmount('');
                setSearch('');
              }}
              className="btn-ghost text-sm text-brand-600"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}

      {/* Total filtré */}
      <div className="mb-3 flex items-center justify-between px-1 text-sm">
        <span className="text-slate-500">
          {filtered.length} dépense{filtered.length > 1 ? 's' : ''}
          {filtered.length !== transactions.length && ` (sur ${transactions.length})`}
        </span>
        <span className="font-semibold tabular-nums">{formatEUR(total)}</span>
      </div>

      {/* Liste */}
      {filtered.length > 0 ? (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((t) => {
            const cat = categories.find((c) => c.id === t.categoryId);
            return (
              <li
                key={t.id}
                className="group flex items-center gap-3 px-4 py-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: cat?.color ?? '#64748b' }}
                >
                  <Icon name={cat?.icon ?? 'Circle'} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{t.merchant}</p>
                    <span className="shrink-0 font-semibold tabular-nums">
                      −{formatEUR(t.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{formatDate(t.date)}</span>
                    <span>·</span>
                    <span>{cat?.label ?? 'Inconnu'}</span>
                    {t.source === 'scan' && (
                      <>
                        <span>·</span>
                        <span className="text-brand-500">scan</span>
                      </>
                    )}
                  </div>
                  {t.note && (
                    <p className="mt-0.5 truncate text-xs text-slate-400">{t.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setEditing(t)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    aria-label="Modifier"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleting(t)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon="Receipt"
          title={hasFilters ? 'Aucun résultat' : 'Aucune dépense'}
          description={
            hasFilters
              ? 'Essayez de modifier vos filtres de recherche.'
              : 'Vos dépenses apparaîtront ici.'
          }
        />
      )}

      {/* Modal édition */}
      {editing && (
        <EditTransactionModal
          transaction={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Dépense modifiée ✓', 'success');
          }}
        />
      )}

      {/* Confirmation suppression */}
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer la dépense ?"
        message={`« ${deleting?.merchant} » (${formatEUR(deleting?.amount ?? 0)}) sera définitivement supprimée.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={async () => {
          if (deleting) {
            await removeTransaction(deleting.id);
            toast('Dépense supprimée', 'info');
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </Layout>
  );
}

function EditTransactionModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: Transaction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { categories } = useStore();
  const [merchant, setMerchant] = useState(transaction.merchant);
  const [amount, setAmount] = useState(String(transaction.amount).replace('.', ','));
  const [date, setDate] = useState(transaction.date);
  const [categoryId, setCategoryId] = useState(transaction.categoryId);
  const [note, setNote] = useState(transaction.note ?? '');

  async function save() {
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;
    await updateTransaction(transaction.id, {
      merchant: merchant.trim() || transaction.merchant,
      amount: Math.round(amountNum * 100) / 100,
      date,
      categoryId,
      note: note.trim() || undefined,
    });
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Modifier la dépense"
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
        <Field label="Marchand" required>
          <input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (€)" required>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date" required>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Catégorie" required>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
