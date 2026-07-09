// ===========================================================================
// Utilitaires de traitement d'image (côté client, offline).
//
// - compression JPEG via canvas (réduit la taille stockée en IndexedDB)
// - conversion File/Blob -> data-URL (pour stockage et envoi à l'OCR)
// - pré-traitement basique optionnel (niveaux de gris / contraste) pour
//   améliorer la reconnaissance OCR des tickets thermiques.
// ===========================================================================

/** Charge un File/Blob en <img> HTMLImageElement. */
export function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de charger l\'image'));
    };
    img.src = url;
  });
}

export interface CompressOptions {
  /** Largeur max en pixels (conserve le ratio). Par défaut 1280. */
  maxWidth?: number;
  /** Hauteur max en pixels (conserve le ratio). Par défaut 2000. */
  maxHeight?: number;
  /** Qualité JPEG 0-1. Par défaut 0.7. */
  quality?: number;
  /** Niveaux de gris (améliore l'OCR des tickets). Par défaut false. */
  grayscale?: boolean;
}

/**
 * Compresse une image (File/Blob) en JPEG data-URL.
 * Utilisé avant stockage dans IndexedDB et avant envoi à l'OCR.
 */
export async function compressImage(
  blob: Blob,
  opts: CompressOptions = {},
): Promise<string> {
  const {
    maxWidth = 1280,
    maxHeight = 2000,
    quality = 0.7,
    grayscale = false,
  } = opts;

  const img = await loadImageElement(blob);

  // Calcul des dimensions cibles en conservant le ratio.
  let { width, height } = img;
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D non disponible');
  ctx.drawImage(img, 0, 0, width, height);

  // Niveaux de gris optionnels (pré-traitement OCR).
  if (grayscale) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Luminance (Rec. 709)
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = y;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Convertit un File/Blob en data-URL sans compression (PNG original).
 * Utile pour prévisualiser rapidement.
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Data-URL -> Blob (pour ré-exporter une image stockée en IndexedDB).
 */
export function dataURLToBlob(dataURL: string): Blob {
  const [meta, base64] = dataURL.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Estime la taille (octets) d'une data-URL base64. */
export function estimateDataURLSize(dataURL: string): number {
  const base64 = dataURL.split(',')[1] ?? '';
  return Math.floor((base64.length * 3) / 4);
}
