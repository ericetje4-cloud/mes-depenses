// ===========================================================================
// Catégorisation intelligente locale : mappings marchand -> catégorie.
//
// Au chargement, ce module enregistre sa fonction de suggestion dans le store
// (via _registerBuiltinSuggestionFn) afin que suggestCategory() puisse
// proposer une catégorie pour un marchand inconnu de l'apprentissage.
// ===========================================================================

import { _registerBuiltinSuggestionFn } from '@/hooks/useStore';
import { DEFAULT_CATEGORIES } from '@/lib/db';

// ---------------------------------------------------------------------------
// IDs des catégories par défaut (stables, pour les mappings intégrés)
// ---------------------------------------------------------------------------

const CAT = {
  alimentation: 'default-1',
  transport: 'default-2',
  logement: 'default-3',
  loisirs: 'default-4',
  sante: 'default-5',
  shopping: 'default-6',
  abonnements: 'default-7',
  restaurants: 'default-8',
  autre: 'default-9',
} as const;

// ---------------------------------------------------------------------------
// Mappings intégrés : liste de mots-clés normalisés par catégorie.
// Le marchand normalisé est testé par inclusion (includes) sur chaque mot-clé.
// ---------------------------------------------------------------------------

const KEYWORDS: Record<string, string[]> = {
  [CAT.alimentation]: [
    'carrefour', 'leclerc', 'auchan', 'intermarche', 'super u', 'supercache',
    'casino', 'monoprix', 'franprix', 'ldlc', 'picard', 'aldi', 'lidl',
    'colruyt', 'naturalia', 'biocoop', 'carrelivre', 'epicerie', 'market',
    'supermarche', 'boulangerie', 'boulanger', 'patisserie', 'primeur',
    'boucherie', 'boucher', 'decathlon market', ' walmart', 'costco',
  ],
  [CAT.transport]: [
    'sncf', 'oui sncf', 'ratp', 'metro', 'bus', 'total', 'shell', 'essence',
    'carburant', 'station', 'autoplus', 'bolt', 'uber', 'kapten', 'heetch',
    'lime', 'tier', 'dott', 'velib', 'parking', 'peage', 'autoroute',
    'edreams', 'airbnb',
  ],
  [CAT.logement]: [
    'edf', 'engie', 'total energies', 'enedis', 'eau', 'lyonnaise', 'veolia',
    'loyer', 'foncia', 'quartier properties', 'assurance', 'axa', 'maaf',
    'macif', 'mgen', 'credit', 'edl', 'gaz', 'electricite',
  ],
  [CAT.loisirs]: [
    'steam', 'playstation', 'xbox', 'nintendo', 'epic games', 'gog', 'origin',
    'netflix', 'disney', 'prime video', 'spotify', 'deezer', 'cinema',
    'pathe', 'ugc', 'decathlon', 'go sport', 'intersport', 'concert',
    'billetterie', 'fnac spectacle',
  ],
  [CAT.sante]: [
    'pharmacie', 'docteur', 'doctolib', 'kiné', 'kine', 'dentiste', 'medical',
    'laboratoire', 'analyse', 'hopital', 'clinique', 'medecin', 'opticien',
    'lunettes', 'audioprothese',
  ],
  [CAT.shopping]: [
    'amazon', 'cdiscount', 'fnac', 'darty', 'boulanger', 'ikea', 'but',
    'zara', 'hm', 'h&m', 'kiabi', 'sephora', 'nocibe', 'decathlon', 'rakuten',
    'aliexpress', 'temu', 'shein', 'zalando', 'asos', 'apple', 'samsung',
    'leroy merlin', 'castorama', 'bricomarche',
  ],
  [CAT.abonnements]: [
    'netflix', 'spotify', 'deezer', 'canal', 'disney', 'prime video',
    'abonnement', 'subscription', 'office', 'microsoft 365', 'adobe',
    'google one', 'icloud', 'dropbox', 'nordvpn', 'expressvpn', 'gym',
    'fitness', 'basic fit', 'neoness', 'salle de sport', 'free', 'orange',
    'sfr', 'bouygues', 'red', 'b and you', 'laposte', 'internet',
    'edf particulier',
  ],
  [CAT.restaurants]: [
    'mcdonald', 'mcdonalds', 'kfc', 'burger king', 'quick', 'subway',
    'pizza', 'pizzeria', 'restaurant', 'resto', 'brasserie', 'bistrot',
    'cafe', 'bar', 'deliveroo', 'just eat', 'ubereats', 'la fourchette',
    'thefork', 'sushi', 'kebab', 'bakery',
  ],
};

// ---------------------------------------------------------------------------
// Fonction de suggestion : retourne un ID de catégorie ou null.
// Reçoit le marchand DÉJÀ normalisé (lowercase, sans accents) par le store.
// ---------------------------------------------------------------------------

function suggest(normalizedMerchant: string): string | null {
  if (!normalizedMerchant) return null;

  // On parcourt les catégories dans un ordre logique (les plus spécifiques
  // d'abord) pour éviter les faux positifs entre catégories proches.
  const ordered = [
    CAT.sante, // "pharmacie" avant "shopping"
    CAT.restaurants, // "mcdonald" avant "alimentation"
    CAT.transport, // "uber" avant "loisirs"
    CAT.abonnements, // "netflix" avant "loisirs"
    CAT.alimentation,
    CAT.logement,
    CAT.loisirs,
    CAT.shopping,
  ];

  for (const catId of ordered) {
    const keywords = KEYWORDS[catId];
    if (!keywords) continue;
    for (const kw of keywords) {
      if (normalizedMerchant.includes(kw)) return catId;
    }
  }
  return null;
}

// Enregistrement auprès du store au chargement du module.
_registerBuiltinSuggestionFn(suggest);

// ---------------------------------------------------------------------------
// Helpers exposés
// ---------------------------------------------------------------------------

/** Palette de couleurs proposée pour les catégories personnalisées. */
export const CATEGORY_COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ef4444',
  '#f59e0b', '#14b8a6', '#f97316', '#64748b', '#8b5cf6',
  '#06b6d4', '#84cc16', '#eab308', '#d946ef',
];

/** Icônes Lucide suggérées pour les nouvelles catégories. */
export const CATEGORY_ICONS = [
  'ShoppingCart', 'ShoppingBag', 'Bus', 'Car', 'Home', 'HeartPulse',
  'Gamepad2', 'Repeat', 'UtensilsCrossed', 'Dumbbell', 'Plane', 'Train',
  'Gift', 'Coffee', 'Book', 'Music', 'Camera', 'Smartphone', 'Wallet',
  'PiggyBank', 'Briefcase', 'GraduationCap', 'Baby', 'PawPrint', 'Circle',
];

/** Catégories par défaut exportées (pour l'UI). */
export { DEFAULT_CATEGORIES };
