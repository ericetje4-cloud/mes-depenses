import { useRef, useState } from 'react'
import {
  Download,
  Moon,
  Plus,
  Sun,
  Upload,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { Button, Card, Input, Label, Modal, Select } from '../components/ui'
import { Icon } from '../components/Icon'
import { exportJSON, importJSON } from '../lib/export'
import { wipeAllData } from '../lib/db'
import { uid } from '../lib/store-utils'
import { normalizeMerchant } from '../lib/categories'
import type { Category } from '../types'

// Couleurs proposées pour les nouvelles catégories.
const PALETTE = ['#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#14b8a6', '#f97316']
// Icônes lucide proposées.
const ICONS = ['Tag', 'Heart', 'Gift', 'Plane', 'Dumbbell', 'Coffee', 'Book', 'Briefcase']

export function SettingsPage({
  categories,
  theme,
  onToggleTheme,
  onAddCategory,
  onDeleteCategory,
  onReload,
}: {
  categories: Category[]
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onAddCategory: (c: Category) => void
  onDeleteCategory: (id: string) => void
  onReload: () => void
}) {
  const [showCat, setShowCat] = useState(false)
  const [showWipe, setShowWipe] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[0])
  const [newIcon, setNewIcon] = useState(ICONS[0])
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleAddCategory() {
    const name = newName.trim()
    if (!name) return
    const id = normalizeMerchant(name) || uid()
    const order = Math.max(...categories.map((c) => c.order), 0) + 1
    onAddCategory({ id: `custom-${id}-${uid().slice(0, 6)}`, name, icon: newIcon, color: newColor, order })
    setNewName('')
    setShowCat(false)
    flash('Catégorie ajoutée.')
  }

  async function handleImport(file: File) {
    try {
      await importJSON(file)
      await onReload()
      flash('Sauvegarde importée avec succès.')
    } catch (e) {
      flash(`Erreur d'import : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleWipe() {
    await wipeAllData()
    await onReload()
    setShowWipe(false)
    flash('Toutes les données ont été effacées.')
  }

  function flash(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3500)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Réglages</h1>

      {msg && (
        <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          {msg}
        </div>
      )}

      {/* Apparence */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Apparence</h2>
        <button
          onClick={onToggleTheme}
          className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50"
        >
          <span className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            Mode {theme === 'dark' ? 'sombre' : 'clair'}
          </span>
          <span className="text-sm text-slate-400">Toucher pour basculer</span>
        </button>
      </Card>

      {/* Catégories */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Catégories</h2>
          <Button variant="ghost" onClick={() => setShowCat(true)}>
            <Plus size={16} />
            Ajouter
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className="group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: c.color }}
            >
              <Icon name={c.icon} size={14} />
              {c.name}
              {!c.isDefault && (
                <button
                  onClick={() => onDeleteCategory(c.id)}
                  className="ml-1 opacity-60 transition hover:opacity-100"
                  aria-label={`Supprimer ${c.name}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Données */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Sauvegarde des données
        </h2>
        <div className="space-y-2">
          <Button variant="secondary" className="w-full justify-start" onClick={() => exportJSON()}>
            <Download size={18} />
            Exporter (sauvegarde JSON)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImport(f)
              if (fileRef.current) fileRef.current.value = ''
            }}
          />
          <Button variant="secondary" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
            <Upload size={18} />
            Importer une sauvegarde
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Tout reste stocké localement sur cet appareil. La sauvegarde JSON permet de transférer vos
          données vers un autre appareil.
        </p>
      </Card>

      {/* Zone dangereuse */}
      <Card className="border-red-200 dark:border-red-900/50">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle size={16} />
          Zone sensible
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Efface définitivement toutes les dépenses, catégories personnalisées et budgets.
        </p>
        <Button variant="danger" className="w-full" onClick={() => setShowWipe(true)}>
          <Trash2 size={18} />
          Tout effacer
        </Button>
      </Card>

      <p className="pb-4 text-center text-xs text-slate-400">
        Suivi de Dépenses · PWA offline-first · v0.1
      </p>

      {/* Modale nouvelle catégorie */}
      <Modal open={showCat} onClose={() => setShowCat(false)} title="Nouvelle catégorie">
        <div className="space-y-4">
          <div>
            <Label>Nom</Label>
            <Input
              placeholder="Ex : Vacances"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`h-8 w-8 rounded-full ${newColor === c ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>Icône</Label>
            <Select value={newIcon} onChange={(e) => setNewIcon(e.target.value)}>
              {ICONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
            <div className="mt-2 flex justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ backgroundColor: newColor }}>
                <Icon name={newIcon} size={20} />
              </span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowCat(false)}>
              Annuler
            </Button>
            <Button className="flex-1" onClick={handleAddCategory} disabled={!newName.trim()}>
              Créer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation reset */}
      <Modal open={showWipe} onClose={() => setShowWipe(false)} title="Tout effacer ?">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Cette action est <strong>irréversible</strong>. Toutes vos données seront supprimées.
          Pensez à exporter une sauvegarde d'abord.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowWipe(false)}>
            Annuler
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleWipe}>
            Tout effacer
          </Button>
        </div>
      </Modal>
    </div>
  )
}
