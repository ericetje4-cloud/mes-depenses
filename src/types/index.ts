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
export type TransactionSource = 'scan' | 'manual' | 'agent';

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
  | 'hasCompletedOnboarding'
  | 'geminiKey' // clé API Gemini (saisie utilisateur, '' = absent)
  | 'geminiModel' // identifiant du modèle Gemini
  | 'voiceEnabled' // saisie vocale (STT) activée
  | 'ttsEnabled'; // lecture vocale des réponses (TTS)

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
  geminiKey: string;
  geminiModel: string;
  voiceEnabled: boolean;
  ttsEnabled: boolean;
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

// ---------------------------------------------------------------------------
// AGENT CONVERSATIONNEL (multimodal + boucle ReAct)
// ---------------------------------------------------------------------------

/** Nature d'une pièce jointe envoyée à l'agent. */
export type AttachmentKind = 'image' | 'audio' | 'pdf' | 'docx' | 'text';

/** Une pièce jointe à un message. */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  /** Nom de fichier d'origine (pour l'affichage). */
  name: string;
  /** Type MIME. */
  mime: string;
  /**
   * Contenu à envoyer au modèle : pour image/audio/pdf → data-URL (base64).
   * Pour docx/text → texte extrait (chaîne).
   */
  data: string;
  /** Taille en octets (pour l'affichage). */
  size: number;
  /** Vignette optionnelle (data-URL) pour l'aperçu image. */
  thumbnail?: string;
}

/** Rôle d'un message dans la conversation. */
export type ChatRole = 'user' | 'model';

/**
 * Étape de raisonnement produite par la boucle ReAct.
 * ReAct = Thought → Action → Observation, répété jusqu'à la réponse finale.
 */
export interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'answer';
  /** Nom du tool appelé (type === 'action' / 'observation'). */
  toolName?: string;
  /** Arguments du tool (type === 'action'). */
  args?: Record<string, unknown>;
  /** Résultat renvoyé par le tool (type === 'observation'). */
  result?: string;
  /** Texte de réflexion ou de réponse finale. */
  text?: string;
}

/** Un message de la conversation avec l'agent. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Horodatage de création (ms epoch). */
  createdAt: number;
  /** Pièces jointes (côté user uniquement). */
  attachments?: Attachment[];
  /** Texte du message (côté user) ou réponse finale (côté model). */
  text?: string;
  /** Trace ReAct associée à ce message model (étapes intermédiaires). */
  steps?: AgentStep[];
  /** true si la génération est en cours. */
  pending?: boolean;
  /** Message d'erreur éventuel. */
  error?: string;
}

