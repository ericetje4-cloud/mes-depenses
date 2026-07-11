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
import { hasApiKey } from '@/lib/gemini';
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

    try {
      // 1. Compression en couleur (maxWidth 1280). La couleur aide Gemini ;
      //    Tesseract convertit lui-même en niveaux de gris en interne.
      const compressed = await compressImage(file, {
        maxWidth: 1280,
        quality: 0.85,
      });
      setImageData(compressed);
      setSource('scan');

      // 2. Tentative d'extraction via Gemini (si clé configurée).
      let result: ParsedReceipt | null = null;
      let usedAI = false;

      if (hasApiKey()) {
        setOcrProgress({ progress: 0.3, status: 'Analyse IA du ticket…' });
        try {
          result = await extractReceiptWithAI(compressed);
          usedAI = true;
        } catch (err) {
          // L'IA a échoué : on bascule sur l'OCR local silencieusement.
          console.warn('[scan] IA échouée, repli OCR', err);
        }
      }

      // 3. Repli : OCR local Tesseract (si pas de clé, IA échouée, ou IA vide).
      const aiEmpty =
        result &&
        !result.merchant &&
        result.total == null &&
        !result.date;

      if ((!result || aiEmpty) && isOCRSupported()) {
        setOcrProgress({ progress: 0.4, status: 'Analyse OCR du ticket…' });
        const ocrResult = await recognizeImage(compressed, (p) =>
          setOcrProgress(p),
        );
        const ocrParsed = parseReceipt(ocrResult.text);
        // On garde le meilleur des deux : si l'IA a trouvé certains champs et
        // l'OCR d'autres, on fusionne (priorité IA).
        result = {
          merchant: result?.merchant ?? ocrParsed.merchant,
          date: result?.date ?? ocrParsed.date,
          total: result?.total ?? ocrParsed.total,
          confidence: {
            merchant: result?.merchant ? 1 : ocrParsed.confidence.merchant,
            date: result?.date ? 1 : ocrParsed.confidence.date,
            total: result?.total != null ? 1 : ocrParsed.confidence.total,
          },
          rawLines: ocrParsed.rawLines,
        };
      }

      setParsed(result);

      // 4. Pré-remplit le formulaire avec les champs extraits.
      if (result?.merchant) setMerchant(result.merchant);
      if (result?.date) setDate(result.date);
      if (result?.total != null) setAmount(String(result.total).replace('.', ','));

      setStep('review');

      // Toast adapté au résultat.
      const foundSomething = result?.merchant || result?.total != null || result?.date;
      if (foundSomething) {
        toast(
          usedAI ? 'Ticket analysé par IA ✓' : 'Ticket analysé ✓',
          'success',
        );
      } else {
        toast('Analyse incomplète. Saisie manuelle.', 'warning');
      }
    } catch (err) {
      console.error(err);
      toast('Échec du scan. Saisie manuelle possible.', 'error');
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
