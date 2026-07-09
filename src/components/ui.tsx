// ===========================================================================
// Composants UI réutilisables (Tailwind).
// Pas de librairie externe : Modal, Sheet (bottom-mobile), Toast, Badge,
// ProgressBar, EmptyState, ConfirmDialog, Field, Select, etc.
// ===========================================================================

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Icon } from './Icon';
import type { Category } from '@/types';
import { formatEUR } from '@/lib/format';
import { statusColor, type BudgetStatus } from '@/lib/store-utils';

// ---------------------------------------------------------------------------
// Modal (centré) — desktop & mobile
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex max-h-[92vh] w-full ${maxW} flex-col rounded-t-2xl bg-white shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
            <h3 className="text-base font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex gap-2 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary flex-1" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`flex-1 ${danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toast (notifications éphémères)
// ---------------------------------------------------------------------------

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  function toast(message: string, type: ToastType = 'info') {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg animate-slide-up ${toastBg(t.type)}`}
            >
              {toastIcon(t.type)}
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function toastBg(type: ToastType): string {
  switch (type) {
    case 'success': return 'bg-green-600';
    case 'error': return 'bg-red-600';
    case 'warning': return 'bg-amber-600';
    case 'info': return 'bg-slate-800 dark:bg-slate-700';
  }
}
function toastIcon(type: ToastType) {
  const props = { size: 18, className: 'shrink-0' };
  switch (type) {
    case 'success': return <CheckCircle2 {...props} />;
    case 'error': return <XCircle {...props} />;
    case 'warning': return <AlertTriangle {...props} />;
    case 'info': return <Info {...props} />;
  }
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans ToastProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// ProgressBar (pour budgets)
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  status = 'ok',
  showLabel = false,
}: {
  value: number; // 0-1 (peut dépasser 1)
  status?: BudgetStatus;
  showLabel?: boolean;
}) {
  const pct = Math.min(value * 100, 100);
  const over = value > 1;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: statusColor(status),
          }}
        />
      </div>
      {over && (
        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
          +{formatEUR((value - 1) * 100, true).replace('€', '%')}
        </span>
      )}
      {showLabel && (
        <span className="w-10 text-right text-xs tabular-nums text-slate-500">
          {Math.round(value * 100)}%
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryBadge (icône + couleur + label)
// ---------------------------------------------------------------------------

export function CategoryBadge({
  category,
  size = 'md',
}: {
  category: Category | undefined;
  size?: 'sm' | 'md';
}) {
  if (!category) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
        <Icon name="Circle" size={size === 'sm' ? 14 : 16} /> Inconnu
      </span>
    );
  }
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const iconSize = size === 'sm' ? 12 : 15;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`flex ${dim} items-center justify-center rounded-lg text-white`}
        style={{ backgroundColor: category.color }}
      >
        <Icon name={category.icon} size={iconSize} />
      </span>
      <span className={size === 'sm' ? 'text-xs' : 'text-sm'}>
        {category.label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

export function EmptyState({
  icon = 'Inbox',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Icon name={icon} size={28} />
      </div>
      <div>
        <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field (label + children) + FormControl wrappers
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Sheet : panneau coulissant bas (mobile-first) / modal desktop — alias Modal
// (on réutilise Modal qui gère déjà le comportement responsive bottom-sheet).
// ---------------------------------------------------------------------------

export { Modal as Sheet };
