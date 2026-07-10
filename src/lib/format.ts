// ===========================================================================
// Formatage localisé (fr-FR) — montants, dates, périodes.
// Aucune librairie externe (Intl natif du navigateur).
// ===========================================================================

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const EUR_COMPACT = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_LONG = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

const RELATIVE = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/** Formate un montant en euros : 12.5 -> "12,50 €". */
export function formatEUR(amount: number, compact = false): string {
  if (!Number.isFinite(amount)) return '—';
  return compact ? EUR_COMPACT.format(amount) : EUR.format(amount);
}

/** Formate une date ISO (yyyy-mm-dd) en "09/07/2026". */
export function formatDate(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return DATE_FMT.format(d);
}

/** Formate une date ISO en version longue : "9 juillet 2026". */
export function formatDateLong(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return DATE_LONG.format(d);
}

/** Formate une date ISO en version courte : "9 juil.". */
export function formatDateShort(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return DATE_SHORT.format(d);
}

/** "il y a 3 jours", "dans 2 mois"... */
export function formatRelative(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / 3_600_000);
    return RELATIVE.format(diffHours, 'hour');
  }
  if (Math.abs(diffDays) < 60) return RELATIVE.format(diffDays, 'day');
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return RELATIVE.format(diffMonths, 'month');
  return RELATIVE.format(Math.round(diffMonths / 12), 'year');
}

// ---------------------------------------------------------------------------
// Helpers de dates
// ---------------------------------------------------------------------------

/** Parse "yyyy-mm-dd" en Date locale (sans décalage UTC). */
export function parseISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date du jour au format ISO (yyyy-mm-dd). */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Convertit une Date en ISO date-only (yyyy-mm-dd). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Renvoie le clé "YYYY-MM" d'une date ISO (pour regroupement mensuel). */
export function monthKey(iso: string): string {
  return iso.slice(0, 7); // "2026-07"
}

/** Label lisible d'un mois : "Juillet 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Label court d'un mois : "Juil.". */
export function monthShortLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d);
}

/** Décale un monthKey de n mois : "2026-07" + 1 -> "2026-08". */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Premier et dernier jour ISO d'un mois donné (key YYYY-MM). */
export function monthRange(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number);
  const start = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  return { start, end };
}

/** true si la date ISO est dans le mois courant. */
export function isThisMonth(iso: string): boolean {
  return monthKey(iso) === monthKey(todayISO());
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Formatage agent (conversation)
// ---------------------------------------------------------------------------

const TIME_FMT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

/** Formate un horodatage (ms epoch) en "14:05". */
export function formatTime(ms: number): string {
  return TIME_FMT.format(new Date(ms));
}

/** Formate une taille de fichier en octets/Ko/Mo. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

