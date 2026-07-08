import { icons, type LucideProps } from 'lucide-react'

/**
 * Affiche une icône lucide-react par son nom (chaîne).
 * Permet de stocker le nom d'icône dans les données (catégories) et de la rendre dynamiquement.
 */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (icons as Record<string, React.ComponentType<LucideProps>>)[name] ?? icons.Circle
  return <Cmp {...props} />
}
