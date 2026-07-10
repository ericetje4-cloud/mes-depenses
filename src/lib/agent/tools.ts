// ===========================================================================
// Outils (tools) de l'agent : déclarations Gemini (function calling) +
// implémentations qui lisent/écrivent la base réelle de Mes Dépenses.
//
// Réutilise les fonctions existantes :
//   - store : addTransaction, updateTransaction, removeTransaction,
//             suggestCategory, setBudget
//   - db     : getAllTransactions, getAllCategories, getAllBudgets
//   - store-utils : filterTransactions, sumAmount, breakdownByCategory,
//                   allBudgetsProgress
//   - ocr/parser  : recognizeImage, parseReceipt
// ===========================================================================

import type { GeminiFunctionDeclaration } from '@/lib/gemini';
import {
  addTransaction,
  updateTransaction,
  removeTransaction,
  suggestCategory,
  setBudget,
} from '@/hooks/useStore';
import {
  getAllTransactions,
  getAllCategories,
  getAllBudgets,
} from '@/lib/db';
import {
  filterTransactions,
  sumAmount,
  breakdownByCategory,
  allBudgetsProgress,
  type TransactionFilter,
} from '@/lib/store-utils';
import { recognizeImage } from '@/lib/ocr';
import { parseReceipt } from '@/lib/parser';
import { formatEUR, formatDate, todayISO, monthKey, shiftMonth } from '@/lib/format';
import type { Attachment } from '@/types';

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

export interface ToolContext {
  /** Pièces jointes image du tour courant (pour recognize_receipt). */
  imageAttachments?: { data: string; name: string }[];
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string>;

export interface ToolDef {
  declaration: GeminiFunctionDeclaration;
  handler: ToolHandler;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Résout un label de catégorie (ex. "Alimentation") vers son id. */
async function resolveCategoryId(label: string): Promise<string | undefined> {
  const cats = await getAllCategories();
  const target = label.trim().toLowerCase();
  return (
    cats.find((c) => c.label.toLowerCase() === target)?.id ??
    cats.find((c) => c.label.toLowerCase().includes(target))?.id
  );
}

// ---------------------------------------------------------------------------
// Outil : add_expense — ajoute une dépense (réutilise addTransaction qui
// apprend automatiquement la catégorie du marchand).
// ---------------------------------------------------------------------------

const addExpense: ToolDef = {
  declaration: {
    name: 'add_expense',
    description:
      'Ajoute une nouvelle dépense (transaction). Renvoie la dépense créée. ' +
      'Si category_label est absent, la catégorie est devinée à partir du marchand.',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Montant en euros, positif (ex. 12.50).',
        },
        merchant: {
          type: 'string',
          description: 'Nom du marchand (ex. "Carrefour").',
        },
        category_label: {
          type: 'string',
          description:
            'Libellé de la catégorie (ex. "Alimentation"). Optionnel : ' +
            'si absent, la catégorie est devinée.',
        },
        date: {
          type: 'string',
          description:
            "Date de la dépense au format AAAA-MM-JJ (ex. \"2026-07-10\"). " +
            "Par défaut : aujourd'hui.",
        },
        note: { type: 'string', description: 'Note libre optionnelle.' },
      },
      required: ['amount', 'merchant'],
    },
  },
  async handler(args) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 'Erreur : montant invalide (doit être un nombre positif).';
    }
    const merchant = String(args.merchant ?? '').trim();
    if (!merchant) return 'Erreur : marchand manquant.';

    // Résolution de la catégorie : label fourni > suggestion apprise > "Autre".
    let categoryId: string | undefined;
    if (args.category_label) {
      categoryId = await resolveCategoryId(String(args.category_label));
    }
    if (!categoryId) categoryId = suggestCategory(merchant);
    if (!categoryId) {
      const cats = await getAllCategories();
      categoryId = cats.find((c) => c.label === 'Autre')?.id ?? cats[0]?.id;
    }
    if (!categoryId) return 'Erreur : aucune catégorie disponible.';

    const date = args.date ? String(args.date) : todayISO();
    const note = args.note ? String(args.note) : undefined;

    const tx = await addTransaction({
      amount: Math.round(amount * 100) / 100,
      date,
      merchant,
      categoryId,
      note,
      source: 'agent',
    });

    const cats = await getAllCategories();
    const catLabel = cats.find((c) => c.id === categoryId)?.label ?? '?';
    return (
      `Dépense ajoutée : ${formatEUR(tx.amount)} chez "${merchant}" ` +
      `(${catLabel}) le ${formatDate(date)} — id ${tx.id}.`
    );
  },
};

// ---------------------------------------------------------------------------
// Outil : list_categories
// ---------------------------------------------------------------------------

const listCategories: ToolDef = {
  declaration: {
    name: 'list_categories',
    description:
      'Liste toutes les catégories de dépenses disponibles avec leur libellé.',
    parameters: { type: 'object', properties: {} },
  },
  async handler() {
    const cats = await getAllCategories();
    if (cats.length === 0) return 'Aucune catégorie définie.';
    return (
      'Catégories disponibles :\n' +
      cats.map((c) => `- ${c.label}`).join('\n')
    );
  },
};

// ---------------------------------------------------------------------------
// Outil : search_transactions — réutilise filterTransactions (store-utils)
// ---------------------------------------------------------------------------

const searchTransactions: ToolDef = {
  declaration: {
    name: 'search_transactions',
    description:
      'Recherche et liste les dépenses (transactions). Filtres optionnels : ' +
      'texte (query), catégorie, plage de dates. Tri du plus récent au plus ancien.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texte à rechercher (marchand ou note).' },
        category_label: { type: 'string', description: 'Filtrer par catégorie.' },
        date_from: { type: 'string', description: 'Date de début (AAAA-MM-JJ, inclus).' },
        date_to: { type: 'string', description: 'Date de fin (AAAA-MM-JJ, inclus).' },
        limit: { type: 'number', description: 'Nombre max de résultats (défaut 20).' },
      },
    },
  },
  async handler(args) {
    const all = await getAllTransactions();
    const cats = await getAllCategories();
    const filter: TransactionFilter = {};
    if (args.query) filter.search = String(args.query);
    if (args.date_from) filter.startDate = String(args.date_from);
    if (args.date_to) filter.endDate = String(args.date_to);
    if (args.category_label) {
      filter.categoryId = await resolveCategoryId(String(args.category_label));
    }
    const limit = args.limit ? Math.min(Number(args.limit), 100) : 20;

    const filtered = filterTransactions(all, filter);

    if (filtered.length === 0) return 'Aucune dépense ne correspond aux critères.';

    const lines = filtered.slice(0, limit).map((tx) => {
      const label = cats.find((c) => c.id === tx.categoryId)?.label ?? '?';
      return `- ${formatDate(tx.date)} | ${formatEUR(tx.amount)} | ${tx.merchant} (${label})${tx.note ? ` « ${tx.note} »` : ''} [id:${tx.id}]`;
    });
    const total = sumAmount(filtered);
    return `${filtered.length} dépense(s) — total ${formatEUR(total)} :\n${lines.join('\n')}`;
  },
};

// ---------------------------------------------------------------------------
// Outil : get_summary — réutilise breakdownByCategory (store-utils)
// ---------------------------------------------------------------------------

const getSummary: ToolDef = {
  declaration: {
    name: 'get_summary',
    description:
      'Calcule le total des dépenses par catégorie pour une période donnée. ' +
      'Période : "this_month" (défaut), "last_month", "this_year", ou "all".',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: '"this_month" | "last_month" | "this_year" | "all"',
        },
      },
    },
  },
  async handler(args) {
    const period = String(args.period ?? 'this_month');
    const all = await getAllTransactions();
    const cats = await getAllCategories();
    const now = monthKey(todayISO());

    let filtered = all;
    if (period === 'this_month') {
      filtered = filterTransactions(all, { monthKey: now });
    } else if (period === 'last_month') {
      filtered = filterTransactions(all, { monthKey: shiftMonth(now, -1) });
    } else if (period === 'this_year') {
      const year = now.slice(0, 4);
      filtered = all.filter((t) => t.date.startsWith(year));
    }

    if (filtered.length === 0) return `Aucune dépense pour la période « ${period} ».`;

    const slices = breakdownByCategory(filtered, cats);
    const grand = sumAmount(filtered);
    const rows = slices.map(
      (s) => `- ${s.label} : ${formatEUR(s.amount)} (${Math.round(s.percent)} %)`,
    );
    return `Résumé (${period}) — ${filtered.length} dépense(s), total ${formatEUR(grand)} :\n${rows.join('\n')}`;
  },
};

// ---------------------------------------------------------------------------
// Outil : update_transaction — réutilise updateTransaction du store
// ---------------------------------------------------------------------------

const updateTransactionTool: ToolDef = {
  declaration: {
    name: 'update_transaction',
    description:
      'Modifie une dépense existante. Au moins un champ parmi amount, merchant, ' +
      'category_label, date, note doit être fourni.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifiant de la dépense.' },
        amount: { type: 'number' },
        merchant: { type: 'string' },
        category_label: { type: 'string' },
        date: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
  },
  async handler(args) {
    const id = String(args.id ?? '');
    const all = await getAllTransactions();
    const existing = all.find((t) => t.id === id);
    if (!existing) return `Erreur : dépense ${id} introuvable.`;

    const patch: {
      amount?: number;
      merchant?: string;
      date?: string;
      note?: string;
      categoryId?: string;
    } = {};
    if (args.amount !== undefined) patch.amount = Number(args.amount);
    if (args.merchant !== undefined) patch.merchant = String(args.merchant);
    if (args.date !== undefined) patch.date = String(args.date);
    if (args.note !== undefined) patch.note = String(args.note);
    if (args.category_label !== undefined) {
      const cid = await resolveCategoryId(String(args.category_label));
      if (!cid) return `Catégorie « ${args.category_label} » introuvable.`;
      patch.categoryId = cid;
    }

    await updateTransaction(id, patch);
    const updated = { ...existing, ...patch };
    return `Dépense modifiée : ${formatEUR(updated.amount)} chez "${updated.merchant}".`;
  },
};

// ---------------------------------------------------------------------------
// Outil : delete_transaction — réutilise removeTransaction du store
// ---------------------------------------------------------------------------

const deleteTransaction: ToolDef = {
  declaration: {
    name: 'delete_transaction',
    description: 'Supprime une dépense existante par son identifiant.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  async handler(args) {
    const id = String(args.id ?? '');
    await removeTransaction(id);
    return `Dépense ${id} supprimée.`;
  },
};

// ---------------------------------------------------------------------------
// Outil : get_budget_status — réutilise allBudgetsProgress (store-utils)
// ---------------------------------------------------------------------------

const getBudgetStatus: ToolDef = {
  declaration: {
    name: 'get_budget_status',
    description:
      "Affiche l'état des budgets (global et par catégorie) du mois courant : " +
      'montant, total dépensé, reste.',
    parameters: { type: 'object', properties: {} },
  },
  async handler() {
    const [all, budgets, cats] = await Promise.all([
      getAllTransactions(),
      getAllBudgets(),
      getAllCategories(),
    ]);
    if (budgets.length === 0) return 'Aucun budget défini.';

    const progresses = allBudgetsProgress(all, budgets, cats);
    const lines = progresses.map(
      (p) =>
        `- ${p.label} : ${formatEUR(p.spent)} / ${formatEUR(p.amount)} (${Math.round(p.progress * 100)} %) — reste ${formatEUR(p.amount - p.spent)}`,
    );
    return `Budgets du mois :\n${lines.join('\n')}`;
  },
};

// ---------------------------------------------------------------------------
// Outil : set_budget — réutilise setBudget du store
// ---------------------------------------------------------------------------

const setBudgetTool: ToolDef = {
  declaration: {
    name: 'set_budget',
    description:
      'Définit ou met à jour un budget mensuel. scope "global" (toutes catégories) ' +
      'ou "category" (avec category_label).',
    parameters: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: '"global" | "category"' },
        amount: { type: 'number', description: 'Montant mensuel en euros.' },
        category_label: {
          type: 'string',
          description: 'Requis si scope = "category".',
        },
      },
      required: ['scope', 'amount'],
    },
  },
  async handler(args) {
    const scope = String(args.scope ?? 'global');
    if (scope !== 'global' && scope !== 'category') {
      return 'Erreur : scope doit être "global" ou "category".';
    }
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return 'Erreur : montant invalide.';
    }
    let categoryId: string | undefined;
    if (scope === 'category') {
      categoryId = await resolveCategoryId(String(args.category_label ?? ''));
      if (!categoryId) return 'Catégorie introuvable.';
    }
    await setBudget(scope, amount, categoryId);
    return `Budget ${scope}${categoryId ? ` (${args.category_label})` : ''} défini à ${formatEUR(amount)}/mois.`;
  },
};

// ---------------------------------------------------------------------------
// Outil : recognize_receipt — OCR local (Tesseract) + parser regex.
// Réutilise recognizeImage + parseReceipt de Mes Dépenses.
// ---------------------------------------------------------------------------

const recognizeReceiptTool: ToolDef = {
  declaration: {
    name: 'recognize_receipt',
    description:
      "Extrait le texte structuré (marchand, date, total) d'une image de reçu " +
      'jointe via OCR local (Tesseract, hors-ligne). À utiliser quand l\'image ' +
      "n'est pas directement interprétable par la vision ou en mode hors-ligne.",
    parameters: { type: 'object', properties: {} },
  },
  async handler(_args, ctx) {
    const img = ctx.imageAttachments?.[0];
    if (!img) {
      return "Erreur : aucune image jointe à analyser. Demandez à l'utilisateur de joindre un reçu.";
    }
    try {
      const ocrResult = await recognizeImage(img.data);
      if (!ocrResult.text.trim()) {
        return 'OCR : aucun texte détecté sur l\'image (confiance faible).';
      }
      // On enrichit avec le parser regex de Mes Dépenses.
      const parsed = parseReceipt(ocrResult.text);
      const parts: string[] = [
        `Texte reconnu du reçu « ${img.name} » (confiance ${Math.round(ocrResult.confidence)} %) :`,
        ocrResult.text,
      ];
      if (parsed.merchant) parts.push(`\nMarchand détecté : ${parsed.merchant}`);
      if (parsed.date) parts.push(`Date détectée : ${parsed.date}`);
      if (parsed.total != null) parts.push(`Total détecté : ${formatEUR(parsed.total)}`);
      return parts.join('\n');
    } catch (e) {
      return `Erreur OCR : ${(e as Error).message}`;
    }
  },
};

// ---------------------------------------------------------------------------
// Registre des outils
// ---------------------------------------------------------------------------

export const ALL_TOOLS: ToolDef[] = [
  addExpense,
  listCategories,
  searchTransactions,
  getSummary,
  updateTransactionTool,
  deleteTransaction,
  getBudgetStatus,
  setBudgetTool,
  recognizeReceiptTool,
];

/** Map nom -> handler pour exécution rapide. */
export const TOOL_HANDLERS: Record<string, ToolHandler> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.declaration.name, t.handler]),
);

/** Déclarations Gemini prêtes à injecter dans generateContent. */
export const TOOL_DECLARATIONS = ALL_TOOLS.map((t) => t.declaration);

// Attachments est utilisé par ToolContext (référence de type conservée).
export type { Attachment };
