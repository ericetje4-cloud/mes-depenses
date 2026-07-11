// ===========================================================================
// Traitement des documents : extraction de texte depuis DOCX (mammoth) et
// PDF (pdfjs-dist). Permet à l'agent de comprendre des factures/reçus
// textuels au-delà des images.
//
// Stratégie :
//   - DOCX : toujours extrait en texte (mammoth, côté navigateur).
//   - PDF  : on tente l'extraction de texte (pdfjs) ; si le PDF est scanné
//     (pas de texte), le PDF reste envoyé nativement à Gemini par l'agent.
// ===========================================================================

import { blobToDataURL, compressImage } from '@/lib/image';
import type { Attachment } from '@/types';

// ---------------------------------------------------------------------------
// Détection du type par extension / mime
// ---------------------------------------------------------------------------

const DOCX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const DOCX_EXTS = new Set(['docx']);

const PDF_MIMES = new Set(['application/pdf']);
const PDF_EXTS = new Set(['pdf']);

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const AUDIO_MIMES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
  'audio/mp4',
]);

const AUDIO_EXTS = new Set(['wav', 'mp3', 'webm', 'ogg', 'aac', 'm4a']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);
const TEXT_EXTS = new Set(['txt', 'md']);

function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Détermine la nature d'un fichier pour l'agent. */
export function detectKind(file: File): Attachment['kind'] {
  const e = ext(file.name);
  if (DOCX_MIMES.has(file.type) || DOCX_EXTS.has(e)) return 'docx';
  if (PDF_MIMES.has(file.type) || PDF_EXTS.has(e)) return 'pdf';
  if (IMAGE_MIMES.has(file.type) || IMAGE_EXTS.has(e)) return 'image';
  if (AUDIO_MIMES.has(file.type) || AUDIO_EXTS.has(e)) return 'audio';
  if (TEXT_EXTS.has(e)) return 'text';
  return 'text';
}

// ---------------------------------------------------------------------------
// DOCX : extraction texte (mammoth)
// ---------------------------------------------------------------------------

/** Extrait le texte brut d'un fichier DOCX via mammoth. */
export async function extractDocxText(file: File): Promise<string> {
  // Import dynamique : mammoth est lourd, on ne le charge qu'à l'usage.
  const mammoth = await import('mammoth/mammoth.browser');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value ?? '';
}

// ---------------------------------------------------------------------------
// PDF : extraction texte (pdfjs-dist)
// ---------------------------------------------------------------------------

/** Initialise pdfjs avec le worker Vite. */
async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist');
  // Worker côté navigateur : on utilise le build fourni par le paquet.
  const workerUrl = (
    await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

/**
 * Extrait le texte d'un PDF. Retourne null si le PDF ne contient pas de
 * couche texte (PDF scanné) — dans ce cas l'appelant enverra le PDF brut
 * à Gemini (qui sait lire les PDFs scannés via sa couche vision).
 */
export async function extractPdfText(file: File): Promise<string | null> {
  try {
    const pdfjs = await getPdfjs();
    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .trim();
      pages.push(text);
    }
    const full = pages.join('\n\n').trim();
    return full.length > 20 ? full : null; // seuil : trop peu = probablement scanné
  } catch (e) {
    console.warn('[documents] extraction PDF échouée', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Construction d'un Attachment depuis un File
// ---------------------------------------------------------------------------

/**
 * Transforme un File en Attachment exploitable par l'agent.
 * - image/audio/pdf : data-URL (envoyée en inlineData à Gemini).
 * - docx/text       : texte extrait (envoyé en texte).
 * - pdf scanné      : data-URL (envoyée en inlineData à Gemini).
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
  const kind = detectKind(file);
  const id = crypto.randomUUID();

  // Texte simple : lecture directe.
  if (kind === 'text') {
    const text = await file.text();
    return {
      id,
      kind: 'text',
      name: file.name,
      mime: file.type || 'text/plain',
      data: text,
      size: file.size,
    };
  }

  // DOCX : extraction texte.
  if (kind === 'docx') {
    try {
      const text = await extractDocxText(file);
      return {
        id,
        kind: 'docx',
        name: file.name,
        mime: file.type,
        data: text || '(document vide)',
        size: file.size,
      };
    } catch (e) {
      throw new Error(`Lecture DOCX échouée : ${(e as Error).message}`);
    }
  }

  // PDF : essai extraction texte, sinon data-URL brute.
  if (kind === 'pdf') {
    const text = await extractPdfText(file);
    if (text) {
      return {
        id,
        kind: 'text', // on le traite comme du texte pour l'agent
        name: file.name,
        mime: file.type,
        data: text,
        size: file.size,
      };
    }
    // PDF scanné : data-URL envoyée à Gemini (inlineData application/pdf).
    const dataUrl = await blobToDataURL(file);
    return {
      id,
      kind: 'pdf',
      name: file.name,
      mime: file.type,
      data: dataUrl,
      size: file.size,
    };
  }

  // Image : compression avant envoi (les photos natives de mobile peuvent
  // dépasser la limite inlineData de Gemini et faire échouer la requête).
  // Audio : data-URL brute (pas de compression audio native).
  if (kind === 'image') {
    const compressed = await compressImage(file, { maxWidth: 1280, quality: 0.85 });
    return {
      id,
      kind,
      name: file.name,
      mime: 'image/jpeg',
      data: compressed,
      size: file.size,
      thumbnail: compressed,
    };
  }

  // Audio : data-URL brute.
  const dataUrl = await blobToDataURL(file);
  return {
    id,
    kind,
    name: file.name,
    mime: file.type,
    data: dataUrl,
    size: file.size,
  };
}
