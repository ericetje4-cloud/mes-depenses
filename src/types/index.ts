// ===========================================================================
// Types partagés de l'application Mes Dépenses.
// Toutes les entités persistées dans IndexedDB sont définies ici.
// ===========================================================================

/** Identifiant unique (généré côté client, triable chronologiquement). */
export type ID = string;

/** Catégorie de dépense : prédéfinie ou créée par l'utilisateur. */
export interface Category {
  id: ID;
  /** Libellé affiché, ex. "Alimentation". */
  label: string;
  /** Nom de l'icône Lucide-react, ex. "ShoppingCart". */
  icon: string;
  /** Couleur Tailwind au format hex, ex. "#22c55e". */
  color: string;
  /** true pour les 9 catégories par défaut (non supprimables). */
  isDefault?: boolean;
  /** Ordre d'affichage. */
  order: number;
  createdAt: number;
}

/** Origine d'une transaction. */
export type TransactionSource = 'scan' | 'manual';

/** Une dépense (toujours un débit, montant > 0). */
export interface Transaction {
  id: ID;
  /** Montant en euros, toujours positif. */
  amount: number;
  /** Date de la dépense (ISO yyyy-mm-dd, minuit local). */
  date: string;
  /** Nom du marchand, ex. "Carrefour". */
  merchant: string;
  /** id de la Category. */
  categoryId: ID;
  /** Note libre optionnelle. */
  note?: string;
  source: TransactionSource;
  /** Image du ticket compressée en JPEG data-URL (optionnel). */
  imageData?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Apprentissage local : associe un nom de marchand normalisé à une catégorie.
 * Si l'utilisateur re-catégorise "Carrefour" en "Alimentation", on mémorise
 * ce choix pour les prochaines dépenses du même marchand.
 */
export interface MerchantRule {
  /** Nom du marchand normalisé (lowercase, sans accents). Clé primaire. */
  merchant: string;
  categoryId: ID;
  updatedAt: number;
}

/** Type de budget. */
export type BudgetScope = 'global' | 'category';

/** Budget mensuel : global ou par catégorie. */
export interface Budget {
  id: ID;
  scope: BudgetScope;
  /** Présent seulement si scope === 'category'. */
  categoryId?: ID;
  /** Montant mensuel en euros. */
  amount: number;
  createdAt: number;
  updatedAt: number;
}

/** Clés du magasin key-value des paramètres. */
export type SettingKey =
  | 'theme' // 'light' | 'dark' | 'system'
  | 'currency' // 'EUR' | 'USD' | ...
  | 'hasCompletedOnboarding';

/** Paramètres applicatifs (magasin key-value). */
export interface Setting<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue<K>;
  updatedAt: number;
}

// Helper : lie une clé de setting à son type de valeur.
export interface SettingValueMap {
  theme: 'light' | 'dark' | 'system';
  currency: string;
  hasCompletedOnboarding: boolean;
}
export type SettingValue<K extends SettingKey> = SettingValueMap[K];

/** Schéma complet exporté/importé pour la sauvegarde JSON. */
export interface BackupPayload {
  app: 'mes-depenses';
  version: number;
  exportedAt: string; // ISO datetime
  transactions: Transaction[];
  categories: Category[];
  merchantRules: MerchantRule[];
  budgets: Budget[];
  settings: Setting[];
}

/**
 * Dépense récurrente détectée (non persistée, calculée à la volée).
 * Détectée sur : même marchand normalisé, montant proche, espacement régulier.
 */
export interface RecurringExpense {
  merchant: string;
  /** Libellé lisible (dernière occurrence connue). */
  merchantLabel: string;
  categoryId: ID;
  /** Montant moyen estimé. */
  averageAmount: number;
  /** Nombre d'occurrences observées. */
  occurrences: number;
  /** Intervalle estimé en jours (ex. 30 ~ mensuel). */
  intervalDays: number;
  /** Date de la prochaine échéance estimée (ISO). */
  nextDate: string;
  lastDate: string;
}
