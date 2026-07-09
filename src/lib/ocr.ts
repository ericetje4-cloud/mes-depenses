// ===========================================================================
// OCR local via Tesseract.js — 100% offline.
//
// Tous les assets (worker, core WASM, modèle de langue) sont servis localement
// depuis /public/tessdata/ : AUCUNE requête vers un CDN, aucune dépendance
// réseau après le premier chargement.
//
// Le worker est réutilisé entre les appels (singleton) pour éviter le coût
// d'initialisation (~2-4s) à chaque scan.
// ===========================================================================

import type { LoggerMessage } from 'tesseract.js';

// ---------------------------------------------------------------------------
// Configuration des chemins locaux (offline)
// ---------------------------------------------------------------------------

// En production les assets sont à la racine (/tessdata/...).
// En dev (Vite) ils sont aussi servis depuis /public -> /tessdata/...
const TESS_BASE = '/tessdata';

const TESSERACT_OPTIONS = {
  // Worker Tesseract (JS qui s'exécute dans un Web Worker).
  workerPath: `${TESS_BASE}/worker.min.js`,
  // Core WASM (point d'entrée qui sélectionne la variante SIMD/non-SIMD).
  corePath: `${TESS_BASE}/core`,
  // Modèle de langue français.
  langPath: TESS_BASE,
  // On télécharge/cache le modèle en local (IndexedDB côté tesseract-core).
  cacheMethod: 'write' as const,
  // Pas de Blob URL : on charge directement depuis notre origine (CORS ok).
  workerBlobURL: false,
} satisfies Partial<import('tesseract.js').WorkerOptions>;

// ---------------------------------------------------------------------------
// Singleton du worker OCR
// ---------------------------------------------------------------------------

import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;
let progressCb: ((progress: number, status: string) => void) | null = null;

/**
 * Crée (ou réutilise) le worker OCR configuré pour le français.
 * Le worker est gardé vivant pour les scans suivants (singleton).
 */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker(
        'fra', // langue : français
        OEM.LSTM_ONLY, // engine : LSTM (moderne, précis, plus léger)
        {
          ...TESSERACT_OPTIONS,
          logger: (m: LoggerMessage) => {
            if (progressCb && typeof m.progress === 'number') {
              progressCb(m.progress, m.status);
            }
          },
        },
      );

      // Paramètres optimisés pour les tickets de caisse thermiques :
      // - PSM 6 : bloc de texte uniforme (layout ticket)
      // - espaces inter-mots préservés (colonnes alignées)
      // - DPI forcé (tickets souvent basse résolution)
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });

      return worker;
    })();
  }
  return workerPromise;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export interface OCRProgress {
  /** Progression 0-1. */
  progress: number;
  /** État courant (ex: "recognizing text", "loading language traineddata"). */
  status: string;
}

export interface OCRResult {
  /** Texte brut reconnu. */
  text: string;
  /** Confiance moyenne (0-100). */
  confidence: number;
  /** Durée en ms. */
  durationMs: number;
}

/**
 * Lance la reconnaissance OCR sur une image.
 *
 * @param image data-URL, File, Blob ou HTMLImageElement
 * @param onProgress callback optionnel (progression 0-1 + statut)
 */
export async function recognizeImage(
  image: string | Blob | File | HTMLImageElement,
  onProgress?: (p: OCRProgress) => void,
): Promise<OCRResult> {
  // Branche le callback de progression le temps de cet appel.
  progressCb = onProgress
    ? (progress, status) => onProgress({ progress, status })
    : null;

  const start = performance.now();

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    const durationMs = Math.round(performance.now() - start);

    return {
      text: data.text ?? '',
      confidence: data.confidence ?? 0,
      durationMs,
    };
  } finally {
    progressCb = null;
  }
}

/**
 * Termine proprement le worker OCR (libère la mémoire).
 * À appeler quand l'utilisateur quitte la page de scan.
 */
export async function terminateOCR(): Promise<void> {
  if (workerPromise) {
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch {
      /* ignore */
    }
    workerPromise = null;
  }
}

/**
 * Indique si l'OCR est disponible (WebAssembly supporté).
 * Tous les navigateurs modernes le supportent.
 */
export function isOCRSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
}
