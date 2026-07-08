import { createWorker, type Worker } from 'tesseract.js'

/**
 * Couche OCR 100% locale (offline).
 *
 * Tous les assets sont servis depuis /public et mis en cache par le Service Worker :
 *  - Worker JS      : /tessdata/worker.min.js
 *  - Cœur WASM      : /tessdata/core/* (Tesseract sélectionne la bonne variante SIMD)
 *  - Langue français: /tessdata/fra.traineddata
 *
 * Aucune requête vers un CDN (contrairement au comportement par défaut de Tesseract.js).
 */

export type ProgressFn = (progress: number, status: string) => void

let workerPromise: Promise<Worker> | null = null

/** Chemins locaux absolus (servis depuis public/). */
const LOCAL_PATHS = {
  workerPath: '/tessdata/worker.min.js',
  corePath: '/tessdata/core',
  langPath: '/tessdata',
}

/**
 * Crée (une seule fois) et réutilise le worker Tesseract.
 * Le worker est coûteux à initialiser (~chargement WASM + langue) : on le garde en cache.
 */
function getWorker(onProgress?: ProgressFn): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('fra', 1, {
      ...LOCAL_PATHS,
      // Évite de créer un blob URL pour le worker : on veut pointer vers notre fichier local.
      workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => {
        onProgress?.(m.progress ?? 0, m.status ?? '')
      },
    }).then((worker) => {
      // Le worker est prêt et la langue est chargée.
      return worker
    })
  }
  return workerPromise
}

/** Terminaison propre du worker (libère la mémoire WASM). */
export async function terminateOCR(): Promise<void> {
  if (workerPromise) {
    try {
      const w = await workerPromise
      await w.terminate()
    } finally {
      workerPromise = null
    }
  }
}

export interface OcrResult {
  /** Texte brut reconnu. */
  text: string
  /** Niveau de confiance moyen (0-100). */
  confidence: number
}

/**
 * Lance la reconnaissance de texte sur une image.
 *
 * @param image data URL (base64), Blob ou URL d'image locale
 * @param onProgress callback de progression (0-1) et libellé de statut
 */
export async function runOCR(
  image: string | Blob,
  onProgress?: ProgressFn,
): Promise<OcrResult> {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(image)
  return {
    text: data.text ?? '',
    confidence: data.confidence ?? 0,
  }
}
