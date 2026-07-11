// ===========================================================================
// Page Ajout : scan de ticket (IA Gemini prioritaire, OCR local en repli) +
// ajout manuel rapide.
// Pipeline : capture/upload → compression →
//            [clé Gemini ? IA vision : OCR Tesseract + parser regex] →
//            formulaire pré-rempli (éditable) → validation → IndexedDB.
// ===========================================================================

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ImagePlus,
  ScanLine,
  Loader2,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { useStore, addTransaction, suggestCategory } from '@/hooks/useStore';
import { navigateTo } from '@/hooks/useNavigation';
import { Layout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { Field, useToast } from '@/components/ui';
import { parseReceipt, type ParsedReceipt } from '@/lib/parser';
import { recognizeImage, isOCRSupported, type OCRProgress } from '@/lib/ocr';
import { compressImage } from '@/lib/image';
import { extractReceiptWithAI } from '@/lib/ai-receipt';
import { hasApiKey, setApiKey, setModel, DEFAULT_MODEL } from '@/lib/gemini';
import { getSetting } from '@/lib/db';
import { formatEUR, parseISO, todayISO } from '@/lib/format';
import type { TransactionSource } from '@/types';

type Step = 'input' | 'scanning' | 'review';

export function AddPage() {
  const { categories } = useStore();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('input');
  const [ocrProgress, setOcrProgress] = useState<OCRProgress | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [imageData, setImageData] = useState<string | undefined>();
  // Diagnostic visible dans la page (pas un toast éphémère).
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // Champs du formulaire (pré-remplis après scan, ou vides pour ajout manuel).
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [source, setSource] = useState<TransactionSource>('manual');

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // Suggestion auto de catégorie quand le marchand change (s'il n'a pas déjà
  // été choisi par l'utilisateur ou le scan).
  useEffect(() => {
    if (!merchant || categoryId) return;
    const suggested = suggestCategory(merchant);
    if (suggested) setCategoryId(suggested);
  }, [merchant, categoryId]);

  /** Gère un fichier image (caméra ou galerie) : analyse IA prioritaire, OCR en repli. */
  async function handleImage(file: File) {
    setStep('scanning');
    setOcrProgress({ progress: 0, status: 'démarrage' });
    setScanLog([]);
    setScanError(null);

    // Helper local : ajoute une ligne au journal visible.
    const log = (line: string) => {
      console.log('[scan]', line);
      setScanLog((prev) => [...prev, line]);
    };
    // Extrait un message d'erreur safe (err peut être undefined ou non-Error).
    const errMsg = (e: unknown): string => {
      if (!e) return 'erreur inconnue';
      if (e instanceof Error) return e.message;
      return String(e);
    };

    // Variables accumulant le résultat des deux pipelines (IA + OCR).
    let merchant: string | undefined;
    let total: number | undefined;
    let date: string | undefined;
    let usedAI = false;
    let aiError: string | undefined;
    let ocrError: string | undefined;
    let rawLines: string[] = [];

    try {
      // 0. Recharge la clé Gemini depuis IndexedDB (au cas où elle n'est pas
      //    en mémoire — ex: navigation privée, reload intempestif).
      try {
        const savedKey = (await getSetting('geminiKey')) ?? '';
        if (savedKey) setApiKey(savedKey);
        const savedModel = (await getSetting('geminiModel')) ?? DEFAULT_MODEL;
        setModel(savedModel);
      } catch {
        /* IndexedDB peut échouer en navigation privée — on continue */
      }

      // Diagnostic initial : clé API présente ?
      log(`Clé API Gemini : ${hasApiKey() ? 'oui' : 'non'}`);

      // 1. Compression en couleur (maxWidth 1280).
      log('Compression de l\'image…');
      const compressed = await compressImage(file, {
        maxWidth: 1280,
        quality: 0.85,
      });
      setImageData(compressed);
      setSource('scan');
      log('Image compressée ✓');

      // 2. Tentative d'extraction via Gemini (si clé configurée).
      if (hasApiKey()) {
        setOcrProgress({ progress: 0.3, status: 'Analyse IA du ticket…' });
        log('Analyse IA (Gemini)…');
        try {
          const aiResult = await extractReceiptWithAI(compressed);
          merchant = aiResult.merchant;
          total = aiResult.total;
          date = aiResult.date;
          usedAI = Boolean(merchant || total || date);
          log(`IA résultat : marchand=${merchant ?? '—'}, total=${total ?? '—'}, date=${date ?? '—'}`);
        } catch (err) {
          aiError = errMsg(err);
          log(`IA échouée : ${aiError}`);
        }
      } else {
        log('Pas de clé API → OCR local uniquement');
      }

      // 3. Repli OCR : si l'IA n'a rien trouvé (ou pas de clé), on tente
      //    l'OCR local. Bloc isolé pour ne jamais planter le pipeline.
      const needOCR =
        (!merchant && total == null && !date) || !hasApiKey();
      if (needOCR && isOCRSupported()) {
        setOcrProgress({ progress: 0.4, status: 'Analyse OCR du ticket…' });
        log('Analyse OCR (Tesseract)…');
        try {
          const ocrResult = await recognizeImage(compressed, (p) =>
            setOcrProgress(p),
          );
          const ocrParsed = parseReceipt(ocrResult.text);
          rawLines = ocrParsed.rawLines;
          // On comble les champs manquants (priorité IA si déjà trouvé).
          merchant = merchant ?? ocrParsed.merchant;
          date = date ?? ocrParsed.date;
          total = total ?? ocrParsed.total;
          log(`OCR résultat : marchand=${ocrParsed.merchant ?? '—'}, total=${ocrParsed.total ?? '—'}, date=${ocrParsed.date ?? '—'}`);
        } catch (err) {
          ocrError = errMsg(err);
          log(`OCR échoué : ${ocrError}`);
        }
      } else if (needOCR && !isOCRSupported()) {
        log('OCR non supporté sur ce navigateur');
      }

      // 4. Construit le ParsedReceipt final (fusion).
      const result: ParsedReceipt = {
        merchant,
        date,
        total,
        confidence: {
          merchant: merchant ? 1 : 0,
          date: date ? 1 : 0,
          total: total != null ? 1 : 0,
        },
        rawLines,
      };
      setParsed(result);

      // 5. Pré-remplit le formulaire.
      if (merchant) setMerchant(merchant);
      if (date) setDate(date);
      if (total != null) setAmount(String(total).replace('.', ','));

      setStep('review');

      // 6. Toast indicatif (le détail est dans le journal visible).
      const foundCount = [merchant, total, date].filter(Boolean).length;
      if (foundCount === 3) {
        toast(usedAI ? 'Ticket analysé par IA ✓' : 'Ticket analysé ✓', 'success');
      } else if (foundCount > 0) {
        toast('Analyse partielle — voir détails.', 'warning');
      } else {
        toast('Analyse impossible — voir détails.', 'warning');
      }
    } catch (err) {
      // Erreur fatale (compression, lecture fichier…). On bascule en manuel.
      const msg = errMsg(err);
      console.error('[scan] erreur fatale :', err);
      log(`ERREUR FATALE : ${msg}`);
      setScanError(msg);
      toast('Échec du scan — voir détails.', 'error');
      setSource('manual');
      setStep('review');
    }
  }

  /** Passage en mode ajout manuel direct. */
  function manualMode() {
    setSource('manual');
    setImageData(undefined);
    setParsed(null);
    setStep('review');
  }

  /** Validation de la dépense. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (!merchant.trim()) return toast('Indiquez un marchand.', 'warning');
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return toast('Montant invalide.', 'warning');
    if (!categoryId) return toast('Choisissez une catégorie.', 'warning');

    const d = parseISO(date);
    if (!d) return toast('Date invalide.', 'warning');

    await addTransaction({
      amount: Math.round(amountNum * 100) / 100,
      date,
      merchant: merchant.trim(),
      categoryId,
      note: note.trim() || undefined,
      source,
      imageData,
    });

    toast('Dépense enregistrée ✓', 'success');
    navigateTo('dashboard');
  }

  function reset() {
    setStep('input');
    setParsed(null);
    setImageData(undefined);
    setMerchant('');
    setAmount('');
    setDate(todayISO());
    setCategoryId('');
    setNote('');
    setSource('manual');
    setScanLog([]);
    setScanError(null);
  }

  return (
    <Layout title="Ajouter une dépense">
      {/* Inputs cachés pour capture (caméra) et galerie */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImage(f);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImage(f);
          e.target.value = '';
        }}
      />

      {step === 'input' && (
        <div className="space-y-4">
          <button
            onClick={() => cameraInput.current?.click()}
            className="card flex w-full items-center gap-4 p-5 text-left transition-transform active:scale-[0.98]"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
              <Camera size={26} />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Scanner un ticket</p>
              <p className="text-sm text-slate-500">
                Prenez en photo un reçu — l'OCR remplit le formulaire.
              </p>
            </div>
            <ScanLine size={20} className="text-brand-500" />
          </button>

          <button
            onClick={() => galleryInput.current?.click()}
            className="card flex w-full items-center gap-4 p-5 text-left transition-transform active:scale-[0.98]"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <ImagePlus size={26} />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Importer une image</p>
              <p className="text-sm text-slate-500">
                Depuis la galerie (ticket déjà photographié).
              </p>
            </div>
          </button>

          <div className="flex items-center gap-3 py-2">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span className="text-xs text-slate-400">OU</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <button onClick={manualMode} className="btn-secondary w-full">
            <Sparkles size={18} /> Ajout manuel rapide
          </button>
          <p className="text-center text-xs text-slate-400">
            Pour virements, abonnements ou achats en ligne.
          </p>
        </div>
      )}

      {step === 'scanning' && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 size={48} className="animate-spin text-brand-500" />
          <div className="text-center">
            <p className="font-semibold">Analyse du ticket…</p>
            <p className="text-sm text-slate-500">
              {ocrProgress?.status ?? 'en cours'}
            </p>
          </div>
          {ocrProgress && (
            <div className="w-full max-w-xs">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${ocrProgress.progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {imageData && (
            <div className="card overflow-hidden">
              <img
                src={imageData}
                alt="Ticket scanné"
                className="max-h-48 w-full object-contain bg-slate-100 dark:bg-slate-800"
              />
            </div>
          )}

          {/* Panneau de diagnostic (visible si scan partiel ou échec) */}
          {(scanLog.length > 0 || scanError) && (
            <div className="card max-h-40 overflow-y-auto p-3">
              <p className="mb-1 text-xs font-semibold text-slate-500">
                Diagnostic du scan
              </p>
              {scanLog.map((line, i) => (
                <p key={i} className="font-mono text-xs text-slate-600 dark:text-slate-300">
                  {line}
                </p>
              ))}
              {scanError && (
                <p className="mt-1 font-mono text-xs font-bold text-red-600">
                  ⚠ {scanError}
                </p>
              )}
            </div>
          )}

          {/* Badge confiance OCR */}
          {parsed && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {parsed.confidence.merchant > 0.5 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  Marchand détecté
                </span>
              )}
              {parsed.confidence.date > 0.5 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  Date détectée
                </span>
              )}
              {parsed.confidence.total > 0.5 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  Total détecté
                </span>
              )}
              <span className="text-slate-400">
                Vérifiez et corrigez si besoin.
              </span>
            </div>
          )}

          <Field label="Marchand" required>
            <input
              className="input"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="ex. Carrefour"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (€)" required>
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Date" required>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Catégorie" required hint="Catégorie suggérée automatiquement">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategoryId(cat.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    categoryId === cat.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: cat.color }}
                  >
                    <Icon name={cat.icon} size={13} />
                  </span>
                  <span className="truncate">{cat.label}</span>
                  {categoryId === cat.id && (
                    <Check size={14} className="ml-auto text-brand-500" />
                  )}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Note (optionnel)">
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex. Courses de la semaine"
            />
          </Field>

          {/* Aperçu montant */}
          {amount && (
            <div className="card flex items-center justify-between p-4">
              <span className="text-sm text-slate-500">Total à enregistrer</span>
              <span className="text-xl font-bold text-brand-600 dark:text-brand-400">
                {formatEUR(parseFloat(amount.replace(',', '.')) || 0)}
              </span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={reset} className="btn-secondary">
              <X size={16} /> Annuler
            </button>
            <button type="submit" className="btn-primary flex-1">
              <Check size={16} /> Enregistrer
            </button>
          </div>
        </form>
      )}
    </Layout>
  );
}
