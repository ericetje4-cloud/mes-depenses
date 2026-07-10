// ===========================================================================
// Page Réglages : thème, gestion des catégories personnalisées, export/import
// JSON (sauvegarde complète), réinitialisation, infos PWA.
// ===========================================================================

import { useEffect, useRef, useState } from 'react';
import {
  Moon,
  Sun,
  Monitor,
  Download,
  Upload,
  Trash2,
  Plus,
  Pencil,
  Tag,
  Database,
  Shield,
  Info,
  X,
  Sparkles,
  Mic,
  Volume2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  useStore,
  addCategory,
  updateCategory,
  removeCategory,
  exportStore,
  importStore,
  resetStore,
} from '@/hooks/useStore';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';
import { Layout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import {
  Field,
  Modal,
  ConfirmDialog,
  useToast,
} from '@/components/ui';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/categories';
import { exportBackupJSON, readBackupFile } from '@/lib/export';
import { estimateDataURLSize } from '@/lib/image';
import { getSetting, setSetting } from '@/lib/db';
import { clearAppCaches } from '@/lib/pwa';
import {
  setApiKey,
  setModel,
  testApiKey,
  hasApiKey,
  DEFAULT_MODEL,
  AVAILABLE_MODELS,
} from '@/lib/gemini';
import { isSTTSupported, isTTSSupported } from '@/lib/speech';
import type { Category } from '@/types';

export function SettingsPage() {
  const { categories, transactions } = useStore();
  const { mode, changeMode } = useTheme();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearCacheOpen, setClearCacheOpen] = useState(false);

  // --- Réglages Agent IA ---
  const [keyInput, setKeyInput] = useState('');
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [voiceOn, setVoiceOn] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const [testing, setTesting] = useState(false);
  const sttSupported = isSTTSupported();
  const ttsSupported = isTTSSupported();

  // Charge les réglages agent au montage.
  useEffect(() => {
    (async () => {
      const k = await getSetting('geminiKey');
      if (k) setKeyInput(k);
      const m = await getSetting('geminiModel');
      setModelState(m ?? DEFAULT_MODEL);
      setVoiceOn((await getSetting('voiceEnabled')) ?? false);
      setTtsOn((await getSetting('ttsEnabled')) ?? false);
    })();
  }, []);

  async function saveKey() {
    const trimmed = keyInput.trim();
    await setSetting('geminiKey', trimmed);
    setApiKey(trimmed);
    toast(trimmed ? 'Clé Gemini enregistrée ✓' : 'Clé Gemini effacée.', trimmed ? 'success' : 'info');
  }

  async function tryKey() {
    if (!keyInput.trim()) {
      toast('Saisissez d\'abord une clé.', 'warning');
      return;
    }
    setTesting(true);
    const result = await testApiKey(keyInput.trim(), model);
    setTesting(false);
    if (result.ok) toast('Clé valide ✓', 'success');
    else toast(`Clé invalide : ${result.message}`, 'error');
  }

  async function changeModel(m: string) {
    setModelState(m);
    await setSetting('geminiModel', m);
    setModel(m);
  }

  async function toggleVoice(on: boolean) {
    setVoiceOn(on);
    await setSetting('voiceEnabled', on);
  }
  async function toggleTts(on: boolean) {
    setTtsOn(on);
    await setSetting('ttsEnabled', on);
  }

  const customCats = categories.filter((c) => !c.isDefault);

  async function handleExport() {
    const payload = await exportStore();
    exportBackupJSON(payload);
    toast('Sauvegarde JSON téléchargée ✓', 'success');
  }

  async function handleImport(file: File) {
    try {
      const payload = await readBackupFile(file);
      await importStore(payload, true);
      toast('Sauvegarde importée ✓', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  // Estimation de la taille des données (images incluses).
  const dataSize = transactions.reduce(
    (sum, t) => sum + (t.imageData ? estimateDataURLSize(t.imageData) : 0),
    0,
  );

  return (
    <Layout title="Réglages">
      <div className="space-y-5">
        {/* Thème */}
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Sun size={15} /> Apparence
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'light', label: 'Clair', icon: Sun },
                { value: 'dark', label: 'Sombre', icon: Moon },
                { value: 'system', label: 'Auto', icon: Monitor },
              ] as { value: ThemeMode; label: string; icon: typeof Sun }[]
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => changeMode(opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition-colors ${
                  mode === opt.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <opt.icon size={18} />
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Agent IA */}
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Sparkles size={15} /> Agent IA
          </h2>

          <Field
            label="Clé API Google Gemini"
            hint="Gratuite sur Google AI Studio (aistudio.google.com/apikey). ⚠️ Stockée en clair dans le navigateur (PWA) — clé gratuite uniquement, jamais de clé payante."
          >
            <input
              type="password"
              className="input font-mono"
              placeholder="AIza..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </Field>

          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1" onClick={saveKey}>
              Enregistrer
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={tryKey}
              disabled={testing}
            >
              {testing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Tester la clé'
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {hasApiKey() ? 'Clé active.' : 'Aucune clé configurée.'}
          </p>

          <div className="mt-4">
            <Field label="Modèle">
              <select
                className="input"
                value={model}
                onChange={(e) => void changeModel(e.target.value)}
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.hint}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
            <ToggleRow
              icon={<Mic size={16} />}
              label="Saisie vocale"
              description={sttSupported ? 'Reconnaissance vocale (FR)' : 'Non supporté par ce navigateur'}
              checked={voiceOn}
              disabled={!sttSupported}
              onChange={(v) => void toggleVoice(v)}
            />
            <ToggleRow
              icon={<Volume2 size={16} />}
              label="Lire les réponses"
              description={ttsSupported ? "Synthèse vocale des réponses de l'agent" : 'Non supporté par ce navigateur'}
              checked={ttsOn}
              disabled={!ttsSupported}
              onChange={(v) => void toggleTts(v)}
            />
          </div>
        </section>

        {/* Catégories personnalisées */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Tag size={15} /> Catégories
            </h2>
            <button
              onClick={() => {
                setEditingCat(null);
                setShowCatForm(true);
              }}
              className="flex items-center gap-1 text-sm font-medium text-brand-600"
            >
              <Plus size={16} /> Nouvelle
            </button>
          </div>

          <div className="space-y-1">
            {customCats.length > 0 ? (
              customCats.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    <Icon name={c.icon} size={14} />
                  </span>
                  <span className="flex-1 text-sm">{c.label}</span>
                  <button
                    onClick={() => {
                      setEditingCat(c);
                      setShowCatForm(true);
                    }}
                    className="rounded p-1 text-slate-400 opacity-0 hover:text-slate-600 group-hover:opacity-100"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      await removeCategory(c.id);
                      toast('Catégorie supprimée', 'info');
                    }}
                    className="rounded p-1 text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-slate-400">
                Aucune catégorie personnalisée. Les 9 catégories par défaut ne
                peuvent pas être supprimées.
              </p>
            )}
          </div>
        </section>

        {/* Données : export / import / reset */}
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Database size={15} /> Données
          </h2>

          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50">
            {transactions.length} dépense{transactions.length > 1 ? 's' : ''} ·{' '}
            {categories.length} catégories · images :{' '}
            {(dataSize / 1024).toFixed(0)} Ko
          </div>

          <div className="space-y-2">
            <button onClick={handleExport} className="btn-secondary w-full justify-start">
              <Download size={16} /> Exporter une sauvegarde (JSON)
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              className="btn-secondary w-full justify-start"
            >
              <Upload size={16} /> Importer une sauvegarde (JSON)
            </button>
            <button
              onClick={() => setClearCacheOpen(true)}
              className="btn-secondary w-full justify-start"
            >
              <RefreshCw size={16} /> Vider le cache de l'application
            </button>
            <button
              onClick={() => setResetOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 size={16} /> Réinitialiser toutes les données
            </button>
          </div>
        </section>

        {/* Confidentialité */}
        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Shield size={15} /> Confidentialité
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Toutes vos données restent sur cet appareil (IndexedDB). Aucune
            donnée n'est envoyée vers un serveur — l'application fonctionne
            intégralement hors-ligne après le premier chargement.
          </p>
        </section>

        {/* À propos */}
        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Info size={15} /> À propos
          </h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Application</dt>
              <dd className="font-medium">Mes Dépenses</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Version</dt>
              <dd className="font-medium">0.1.0</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Technologie</dt>
              <dd className="font-medium">React 19 · PWA · IndexedDB</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Formulaire catégorie */}
      {showCatForm && (
        <CategoryForm
          category={editingCat}
          onClose={() => setShowCatForm(false)}
          onSaved={() => {
            setShowCatForm(false);
            toast(editingCat ? 'Catégorie modifiée ✓' : 'Catégorie créée ✓', 'success');
          }}
        />
      )}

      <ConfirmDialog
        open={resetOpen}
        title="Tout réinitialiser ?"
        message="Toutes vos dépenses, catégories personnalisées et budgets seront définitivement effacés. Pensez à exporter une sauvegarde d'abord."
        confirmLabel="Tout supprimer"
        danger
        onConfirm={async () => {
          await resetStore();
          setResetOpen(false);
          toast('Données réinitialisées', 'info');
        }}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmDialog
        open={clearCacheOpen}
        title="Vider le cache de l'application ?"
        message="Les fichiers en cache (JS, CSS, images) seront effacés et les Service Workers désactivés pour forcer le chargement de la dernière version. Vos données (dépenses, budgets) sont conservées. L'application va recharger."
        confirmLabel="Vider & recharger"
        onConfirm={async () => {
          setClearCacheOpen(false);
          try {
            await clearAppCaches();
          } finally {
            // Recharge depuis le réseau pour récupérer la dernière version.
            window.location.reload();
          }
        }}
        onCancel={() => setClearCacheOpen(false)}
      />
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Formulaire création / édition de catégorie
// ---------------------------------------------------------------------------

function CategoryForm({
  category,
  onClose,
  onSaved,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(category?.label ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'Circle');
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);

  async function save() {
    if (!label.trim()) return;
    if (category) {
      await updateCategory(category.id, { label: label.trim(), icon, color });
    } else {
      await addCategory({ label: label.trim(), icon, color });
    }
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      footer={
        <>
          <button className="btn-secondary flex-1" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary flex-1" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Aperçu */}
        <div className="flex items-center justify-center py-2">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: color }}
          >
            <Icon name={icon} size={26} />
          </span>
        </div>

        <Field label="Nom" required>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex. Animaux"
            autoFocus
          />
        </Field>

        <Field label="Icône">
          <div className="grid grid-cols-7 gap-1.5">
            {CATEGORY_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`flex h-9 items-center justify-center rounded-lg border ${
                  icon === ic
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                    : 'border-transparent bg-slate-100 dark:bg-slate-800'
                }`}
              >
                <Icon name={ic} size={16} />
              </button>
            ))}
          </div>
        </Field>

        <Field label="Couleur">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition-transform ${
                  color === c ? 'ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900' : ''
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ligne de réglage avec interrupteur (toggle) — utilisé pour la voix.
// ---------------------------------------------------------------------------

function ToggleRow({
  icon,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

