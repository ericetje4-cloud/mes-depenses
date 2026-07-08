import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, ScanLine, Save, Trash2, X } from 'lucide-react'
import { Button, Card, Input, Label, Modal, Select, Textarea } from '../components/ui'
import { Icon } from '../components/Icon'
import { fileToDataURL, resizeImage } from '../lib/image'
import { runOCR } from '../lib/ocr'
import { parseReceipt } from '../lib/parser'
import { suggestCategory } from '../lib/categories'
import { formatEUR, todayISO } from '../lib/format'
import { uid } from '../lib/store-utils'
import { getLearnedMerchants } from '../lib/db'
import type { Category, Expense } from '../types'

type ScanState = 'idle' | 'reading' | 'recognizing'

export function AddPage({
  categories,
  onSave,
  onDelete,
  onCancel,
  editing,
}: {
  categories: Category[]
  onSave: (e: Expense) => void
  onDelete?: (id: string) => void
  onCancel: () => void
  editing?: Expense
}) {
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [merchant, setMerchant] = useState(editing?.merchant ?? '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? categories[0]?.id ?? 'autre')
  const [note, setNote] = useState(editing?.note ?? '')
  const [receiptImage, setReceiptImage] = useState<string | undefined>(editing?.receiptImage)
  const [fromScan, setFromScan] = useState(editing?.fromScan ?? false)

  const [scan, setScan] = useState<ScanState>('idle')
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [scanError, setScanError] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Re-suggère la catégorie quand le marchand change (mode ajout uniquement).
  useEffect(() => {
    if (editing) return
    if (!merchant.trim()) return
    getLearnedMerchants().then((learned) => {
      const suggested = suggestCategory(merchant, learned)
      if (suggested) setCategoryId(suggested)
    })
  }, [merchant, editing])

  async function handleScan(file: File) {
    setScanError('')
    try {
      setScan('reading')
      const raw = await fileToDataURL(file)
      const img = await resizeImage(raw)
      setReceiptImage(img)
      setScan('recognizing')
      const result = await runOCR(img, (p, s) => {
        setProgress(Math.round(p * 100))
        setStatusText(s)
      })
      const parsed = parseReceipt(result.text)
      if (parsed.merchant) setMerchant(parsed.merchant)
      if (parsed.date) setDate(parsed.date)
      if (parsed.amount !== null) setAmount(parsed.amount.toFixed(2))
      setFromScan(true)
      setScan('idle')
    } catch (e) {
      console.error(e)
      setScanError(e instanceof Error ? e.message : String(e))
      setScan('idle')
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleScan(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseFloat(amount.replace(',', '.'))
    if (!value || value <= 0) return
    const now = Date.now()
    const expense: Expense = {
      id: editing?.id ?? uid(),
      amount: value,
      date,
      merchant: merchant.trim() || 'Dépense',
      categoryId,
      note: note.trim() || undefined,
      receiptImage,
      fromScan,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    }
    onSave(expense)
  }

  const busy = scan !== 'idle'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
          {editing ? 'Modifier la dépense' : 'Nouvelle dépense'}
        </h1>
        <button
          onClick={onCancel}
          className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X size={20} />
        </button>
      </div>

      {/* Bouton scan OCR */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />

      {scan === 'idle' ? (
        <Card className="mb-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 py-4 font-medium text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
          >
            <ScanLine size={20} />
            Scanner un ticket
          </button>
          {scanError && (
            <p className="mt-2 text-center text-sm text-red-500">Échec du scan : {scanError}</p>
          )}
        </Card>
      ) : (
        <Card className="mb-4 flex items-center gap-3">
          <Loader2 className="animate-spin text-indigo-500" size={22} />
          <div className="text-sm">
            <p className="font-medium text-slate-700 dark:text-slate-200">
              {scan === 'reading' ? "Lecture de l'image…" : 'Reconnaissance du texte…'}
            </p>
            {statusText && (
              <p className="text-slate-400">
                {statusText} {progress > 0 && `· ${progress}%`}
              </p>
            )}
          </div>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Montant */}
        <div>
          <Label>Montant</Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pr-10 text-lg font-semibold"
              required
              autoFocus={!editing}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
              €
            </span>
          </div>
        </div>

        {/* Marchand */}
        <div>
          <Label>Marchand / Libellé</Label>
          <Input
            placeholder="Ex : Carrefour, Netflix…"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </div>

        {/* Date + Catégorie */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Note */}
        <div>
          <Label>Note (optionnel)</Label>
          <Textarea
            rows={2}
            placeholder="Détails complémentaires…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Aperçu du ticket */}
        {receiptImage && (
          <div>
            <Label>Ticket scanné</Label>
            <img
              src={receiptImage}
              alt="Ticket"
              className="max-h-40 w-auto rounded-lg border border-slate-200 dark:border-slate-700"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" className="flex-1" disabled={busy}>
            <Save size={18} />
            {editing ? 'Enregistrer' : 'Ajouter'}
          </Button>
          {editing && onDelete && (
            <Button type="button" variant="danger" onClick={() => setShowDelete(true)}>
              <Trash2 size={18} />
            </Button>
          )}
        </div>
      </form>

      {/* Confirmation de suppression */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Supprimer la dépense ?">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Cette action est définitive. La dépense de{' '}
          <strong>{formatEUR(editing?.amount ?? 0)}</strong> sera supprimée.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowDelete(false)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              if (editing && onDelete) onDelete(editing.id)
            }}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  )
}

/** Liste verticale des catégories (sélecteur visuel). Utilisé pour de futurs écrans. */
export function CategoryPicker({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition ${
            selected === c.id
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
              : 'border-slate-200 dark:border-slate-700'
          }`}
          style={selected === c.id ? { borderColor: c.color } : undefined}
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: c.color }}
          >
            <Icon name={c.icon} size={18} />
          </span>
          {c.name}
        </button>
      ))}
    </div>
  )
}

// Ré-export pour réutilisation de Camera dans d'autres écrans si besoin.
export { Camera }
