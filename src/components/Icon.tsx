// ===========================================================================
// Composant Icon : rend une icône Lucide-react à partir de son nom.
// Utilisé pour les catégories (icône stockée en base) et l'UI.
// ===========================================================================

import { icons, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';

export interface IconProps extends LucideProps {
  /** Nom de l'icône Lucide, ex. "ShoppingCart", "home", "HeartPulse". */
  name: string;
  /** Fallback si le nom est introuvable. */
  fallback?: string;
}

export function Icon({ name, fallback = 'Circle', ...props }: IconProps) {
  // Les noms stockés peuvent être en PascalCase ("ShoppingCart").
  // On normalise pour trouver la clé dans l'objet `icons`.
  const key = resolveIconKey(name) ?? resolveIconKey(fallback) ?? 'Circle';
  const Cmp = (icons as Record<string, ComponentType<LucideProps>>)[key] ?? icons.Circle;

  return <Cmp {...props} />;
}

/** Vérifie qu'un nom d'icône existe dans Lucide. */
export function iconExists(name: string): boolean {
  return !!resolveIconKey(name);
}

/** Liste toutes les icônes disponibles (pour le sélecteur de catégorie). */
export function listAvailableIcons(): string[] {
  return Object.keys(icons).filter(
    // On exclut les alias suffixed "Icon" pour réduire le bruit.
    (k) => !k.endsWith('Icon'),
  );
}

function resolveIconKey(name: string): string | undefined {
  if (!name) return undefined;
  // 1. Tel quel (PascalCase).
  if (name in icons) return name;
  // 2. Variantes casse.
  const pascal = toPascalCase(name);
  if (pascal in icons) return pascal;
  return undefined;
}

function toPascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}
