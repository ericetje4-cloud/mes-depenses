import type { Category } from '../types'

/**
 * Catégories par défaut créées au premier lancement.
 * Les `id` sont des slugs stables (non supprimables par l'utilisateur).
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'alimentation', name: 'Alimentation', icon: 'ShoppingCart', color: '#22c55e', isDefault: true, order: 1 },
  { id: 'transport', name: 'Transport', icon: 'Car', color: '#3b82f6', isDefault: true, order: 2 },
  { id: 'logement', name: 'Logement', icon: 'Home', color: '#a855f7', isDefault: true, order: 3 },
  { id: 'loisirs', name: 'Loisirs', icon: 'Gamepad2', color: '#ec4899', isDefault: true, order: 4 },
  { id: 'sante', name: 'Santé', icon: 'HeartPulse', color: '#ef4444', isDefault: true, order: 5 },
  { id: 'shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#f59e0b', isDefault: true, order: 6 },
  { id: 'abonnements', name: 'Abonnements', icon: 'Repeat', color: '#14b8a6', isDefault: true, order: 7 },
  { id: 'restaurants', name: 'Restaurants', icon: 'Utensils', color: '#f97316', isDefault: true, order: 8 },
  { id: 'autre', name: 'Autre', icon: 'CircleEllipsis', color: '#64748b', isDefault: true, order: 99 },
]

/** Associations marchand -> catégorie connues pour la suggestion automatique. */
export const KNOWN_MERCHANTS: Record<string, string> = {
  // Alimentation
  carrefour: 'alimentation', auchan: 'alimentation', leclerc: 'alimentation',
  intermarche: 'alimentation', superu: 'alimentation', casino: 'alimentation',
  lidl: 'alimentation', aldi: 'alimentation', monoprix: 'alimentation',
  franprix: 'alimentation', 'naturalia': 'alimentation', picard: 'alimentation',
  // Restaurants
  mcdonalds: 'restaurants', mcdonald: 'restaurants', kfc: 'restaurants',
  quick: 'restaurants', subway: 'restaurants', 'burger': 'restaurants',
  dominos: 'restaurants', 'pizza': 'restaurants', uber: 'restaurants',
  deliveroo: 'restaurants',
  // Transport
  sncf: 'transport', ratp: 'transport', shell: 'transport', total: 'transport',
  esso: 'transport', bp: 'transport', totalenergies: 'transport',
  // Santé
  pharmacie: 'sante', docteur: 'sante', doctolib: 'sante', clinique: 'sante',
  // Shopping
  amazon: 'shopping', cdiscount: 'shopping', fnac: 'shopping', darty: 'shopping',
  zalando: 'shopping', shein: 'shopping',
  // Abonnements
  netflix: 'abonnements', spotify: 'abonnements', deezer: 'abonnements',
  canal: 'abonnements', disney: 'abonnements', 'orange': 'abonnements',
  sfr: 'abonnements', free: 'abonnements', bouygues: 'abonnements',
  // Loisirs
  steam: 'loisirs', playstation: 'loisirs', xbox: 'loisirs', cinem: 'loisirs',
}

/**
 * Normalise un nom de marchand pour la comparaison :
 * minuscules, sans accents, sans ponctuation ni espaces multiples.
 */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9 ]/g, ' ')     // ponctuation
    .replace(/\s+/g, ' ')
    .trim()
}

/** Récupère la clé de reconnaissance (premier mot significatif) d'un marchand. */
function merchantKey(name: string): string {
  const normalized = normalizeMerchant(name)
  return normalized.split(' ')[0] ?? normalized
}

/**
 * Suggère une catégorie pour un marchand donné.
 * Ordre de priorité : apprentissage local (MerchantCategory) > table connue > 'autre'.
 *
 * @param merchant nom saisi
 * @param learned apprentissage local { marchandNormalisé: categoryId }
 */
export function suggestCategory(
  merchant: string,
  learned: Record<string, string>,
): string {
  const key = merchantKey(merchant)
  if (!key) return 'autre'
  if (learned[key]) return learned[key]
  // Recherche par sous-chaîne dans la table connue
  for (const [known, cat] of Object.entries(KNOWN_MERCHANTS)) {
    if (key.includes(known) || known.includes(key)) return cat
  }
  return 'autre'
}
