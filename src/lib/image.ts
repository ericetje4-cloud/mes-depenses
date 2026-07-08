/**
 * Utilitaires de traitement d'image pour l'OCR et le stockage.
 */

/** Taille maximale (largeur) avant redimensionnement, pour accélérer l'OCR. */
const MAX_WIDTH = 1600

/**
 * Lit un fichier image et renvoie un data URL (base64).
 * Utile pour stocker l'image du ticket dans IndexedDB et la passer à l'OCR.
 */
export function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Redimensionne une image (si trop grande) via un canvas pour :
 *  - réduire la taille de stockage dans IndexedDB,
 *  - accélérer l'OCR.
 * Renvoie un data URL JPEG compressé.
 */
export async function resizeImage(dataURL: string, maxWidth = MAX_WIDTH): Promise<string> {
  const img = await loadImage(dataURL)
  if (img.width <= maxWidth) return dataURL

  const scale = maxWidth / img.width
  const canvas = document.createElement('canvas')
  canvas.width = maxWidth
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataURL
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** Charge un data URL dans un élément HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
