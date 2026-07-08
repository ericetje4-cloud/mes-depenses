// Types de données de l'application — base de toutes les entités stockées dans IndexedDB.

/** Catégorie de dépense (par défaut ou personnalisée par l'utilisateur). */
export interface Category {
  /** Identifiant stable : un slug pour les catégories par défaut, un uuid pour les perso. */
  id: string
  /** Libellé affiché (ex: "Alimentation"). */
  name: string
  /** Nom de l'icône lucide-react (ex: "ShoppingCart"). */
  icon: string
  /** Couleur Tailwind / hex utilisée pour les graphiques et pastilles. */
  color: string
  /** true pour les catégories par défaut non supprimables. */
  isDefault?: boolean
  /** Ordre d'affichage. */
  order: number
}

/** Dépense enregistrée (ajout manuel ou issue d'un scan OCR). */
export interface Expense {
  /** Identifiant unique (crypto.randomUUID()). */
  id: string
  /** Montant en euros (toujours positif). */
  amount: number
  /** Date de la dépense au format ISO (YYYY-MM-DD). */
  date: string
  /** Nom du marchand ou libellé libre (ex: "Carrefour", "Abonnement Netflix"). */
  merchant: string
  /** Identifiant de catégorie (référence Category.id). */
  categoryId: string
  /** Note optionnelle. */
  note?: string
  /** Image du ticket en data URL (base64) si la dépense vient d'un scan. */
  receiptImage?: string
  /** true si la dépense a été créée via OCR. */
  fromScan?: boolean
  /** Horodatage de création (ms). */
  createdAt: number
  /** Horodatage de dernière modification (ms). */
  updatedAt: number
}

/** Budget défini par l'utilisateur (global ou par catégorie). */
export interface Budget {
  /** Identifiant unique. */
  id: string
  /** 'global' pour le budget mensuel global, 'category' pour une catégorie. */
  type: 'global' | 'category'
  /** Si type='category', référence Category.id. */
  categoryId?: string
  /** Montant mensuel alloué en euros. */
  amount: number
  /** Horodatage de création (ms). */
  createdAt: number
  /** Horodatage de dernière modification (ms). */
  updatedAt: number
}

/**
 * Apprentissage local : associe un nom de marchand normalisé à une catégorie.
 * Permet de suggérer automatiquement la catégorie des prochaines dépenses,
 * et de mémoriser les corrections manuelles de l'utilisateur.
 */
export interface MerchantCategory {
  /** Nom du marchand normalisé (minuscules, sans accents). */
  merchant: string
  /** Catégorie attribuée (référence Category.id). */
  categoryId: string
  /** Nombre de fois où cette association a été confirmée. */
  count: number
  /** Horodatage de dernière mise à jour (ms). */
  updatedAt: number
}

/** Format du fichier d'export JSON complet (sauvegarde / restauration). */
export interface BackupFile {
  /** Version du format, pour les migrations futures. */
  version: number
  /** Date de génération de la sauvegarde (ISO). */
  exportedAt: string
  /** Nom de l'application émettrice. */
  app: string
  expenses: Expense[]
  categories: Category[]
  budgets: Budget[]
  merchantCategories: MerchantCategory[]
}
