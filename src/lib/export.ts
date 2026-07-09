// ===========================================================================
// Export de données : CSV (transactions filtrées) + téléchargement JSON.
// 100% côté client, aucun réseau.
// ===========================================================================

import type { BackupPayload, Transaction, Category } from '@/types';
import { formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Téléchargement générique d'un blob
// ---------------------------------------------------------------------------

/** Déclenche le téléchargement d'un Blob avec un nom de fichier. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Libération différée (laisse le navigateur démarrer le téléchargement).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 10); // yyyy-mm-dd
}

// ---------------------------------------------------------------------------
// CSV : transactions filtrées
// ---------------------------------------------------------------------------

/**
 * Génère un CSV (séparateur ";", encodage Excel FR) à partir de transactions.
 * Les champs sont échappés (gestion des guillemets et points-virgules).
 */
export function transactionsToCSV(
  transactions: Transaction[],
  categories: Category[],
): string {
  const catLabel = (id: string) =>
    categories.find((c) => c.id === id)?.label ?? 'Inconnu';

  const header = [
    'Date',
    'Marchand',
    'Catégorie',
    'Montant (€)',
    'Source',
    'Note',
  ];

  const rows = transactions.map((t) => [
    formatDate(t.date),
    t.merchant,
    catLabel(t.categoryId),
    t.amount.toFixed(2).replace('.', ','),
    t.source === 'scan' ? 'Scan' : 'Manuel',
    t.note ?? '',
  ]);

  const all = [header, ...rows];
  return all
    .map((row) => row.map(csvEscape).join(';'))
    .join('\r\n');
}

function csvEscape(value: string): string {
  const needsQuote = /[;"\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

/** Télécharge les transactions filtrées en CSV. */
export function exportTransactionsCSV(
  transactions: Transaction[],
  categories: Category[],
): void {
  // BOM UTF-8 pour qu'Excel lise correctement les accents.
  const csv = '\uFEFF' + transactionsToCSV(transactions, categories);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `depenses-${timestamp()}.csv`);
}

// ---------------------------------------------------------------------------
// JSON : sauvegarde complète
// ---------------------------------------------------------------------------

/** Télécharge une sauvegarde JSON complète de la base. */
export function exportBackupJSON(payload: BackupPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `mes-depenses-sauvegarde-${timestamp()}.json`);
}

/**
 * Lit et parse un fichier JSON de sauvegarde (depuis un <input type=file>).
 * Valide la structure minimale.
 */
export function readBackupFile(file: File): Promise<BackupPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Partial<BackupPayload>;
        if (data?.app !== 'mes-depenses') {
          throw new Error(
            'Fichier invalide : ce n\'est pas une sauvegarde de Mes Dépenses.',
          );
        }
        if (!Array.isArray(data.transactions)) {
          throw new Error('Sauvegarde corrompue : transactions manquantes.');
        }
        resolve(data as BackupPayload);
      } catch (err) {
        reject(
          err instanceof Error
            ? err
            : new Error('Impossible de lire le fichier de sauvegarde.'),
        );
      }
    };
    reader.onerror = () => reject(new Error('Lecture du fichier échouée.'));
    reader.readAsText(file);
  });
}
