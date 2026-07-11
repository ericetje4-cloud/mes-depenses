// ===========================================================================
// Extraction de ticket via la vision Gemini (alternative à l'OCR local).
//
// Envoie une photo de reçu à Gemini avec un prompt structuré (mode JSON) pour
// en extraire : marchand, montant total, date. La catégorie est suggérée plus
// tard par l'heuristique locale (suggestCategory), pas par l'IA.
//
// En cas d'échec (pas de clé, réseau, réponse illisible), on lève une erreur
// pour que l'appelant puisse basculer sur le repli OCR Tesseract.
// ===========================================================================

import {
  generateContent,
  inlineFromDataURL,
  hasApiKey,
} from '@/lib/gemini';
import { getSetting } from '@/lib/db';
import { setApiKey, setModel, DEFAULT_MODEL } from '@/lib/gemini';
import type { ParsedReceipt } from '@/lib/parser';

/** Prompt system : rôle + consignes d'extraction. */
const SYSTEM_PROMPT = `Tu es un extracteur automatique de tickets de caisse et factures. Tu reçois l'image d'un reçu et tu DOIS extraire ces trois champs obligatoirement, même si c'est approximatif :
- "merchant" : le nom de l'enseigne, du magasin ou du commerçant (texte court, sans adresse ni téléphone)
- "total" : le montant TOTAL à payer (un NOMBRE décimal en euros, sans le symbole € ni le mot "euros" — ex: 24.90 et PAS "24,90 €" ni "24,90")
- "date" : la date d'achat au format AAAA-MM-JJ (si l'année n'est pas visible, utilise 2026)

IMPORTANT :
- "total" doit être un nombre, pas une chaîne. Utilise un point comme séparateur décimal (24.90).
- Réponds UNIQUEMENT avec un objet JSON. Aucun texte avant ou après.
- Même si le ticket est partiellement illisible, fais de ton mieux pour remplir tous les champs.

Format de réponse attendu :
{"merchant":"Carrefour","total":24.90,"date":"2026-07-12"}`;

/**
 * Normalise un montant : accepte number, string avec virgule ou point,
 * symbole €, espaces. Retourne un number ou undefined.
 */
function normalizeTotal(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return Math.round(v * 100) / 100;
  }
  if (typeof v === 'string') {
    // Retire tout sauf chiffres, point et virgule ; remplace virgule par point.
    const cleaned = v.replace(/[^\d.,-]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return undefined;
}

/** Normalise une date : accepte AAAA-MM-JJ, JJ/MM/AAAA, JJ-MM-AAAA. */
function normalizeDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  // Format ISO déjà correct.
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Format JJ/MM/AAAA.
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

/** Récupère une valeur depuis un objet en essayant plusieurs clés. */
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

/**
 * Extrait les informations d'un ticket de caisse depuis une image via Gemini.
 *
 * @param imageDataURL data-URL de l'image (compressée, ex: 1280px JPEG).
 * @returns Un ParsedReceipt partiel (champs trouvés + confiance 1, absents = 0).
 * @throws si pas de clé configurée, ou si Gemini échoue / répond de l'illisible.
 */
export async function extractReceiptWithAI(
  imageDataURL: string,
): Promise<ParsedReceipt> {
  // Charge la clé + le modèle depuis IndexedDB (peuvent ne pas être en runtime
  // si l'utilisateur n'est pas passé par Réglages depuis le démarrage).
  const key = (await getSetting('geminiKey')) ?? '';
  if (!key) {
    throw new Error('Aucune clé API Gemini configurée.');
  }
  const model = (await getSetting('geminiModel')) ?? DEFAULT_MODEL;

  // Synchronise le runtime du client Gemini pour cet appel isolé.
  setApiKey(key);
  setModel(model);

  if (!hasApiKey()) {
    throw new Error('Aucune clé API Gemini configurée.');
  }

  // Construit la requête : image (inlineData) + instruction.
  const inline = inlineFromDataURL(imageDataURL);
  const resp = await generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: inline },
          { text: 'Extrails le marchand, le montant total et la date de ce ticket. Réponds en JSON.' },
        ],
      },
    ],
    systemInstruction: SYSTEM_PROMPT,
    jsonMode: true, // force application/json
    temperature: 0, // extraction factuelle, pas de créativité
  });

  // Le mode JSON de Gemini renvoie le JSON dans le texte du candidat.
  const candidate = resp.candidates?.[0];
  const rawText = candidate?.content?.parts
    ?.map((p) => ('text' in p ? p.text : ''))
    .join('')
    .trim() ?? '';

  console.debug('[ai-receipt] réponse brute de Gemini :', rawText);

  if (!rawText) {
    throw new Error('Gemini n\'a renvoyé aucun texte.');
  }

  // Le modèle peut envelopper le JSON dans des ```json ... ``` ; on nettoie.
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('Réponse Gemini illisible (JSON invalide).');
  }

  // Accepte les clés françaises ET anglaises (le modèle peut varier).
  const merchantRaw = pick(obj, ['merchant', 'marchand', 'enseigne', 'commercant', 'shop', 'store', 'name']);
  const merchant =
    typeof merchantRaw === 'string' && merchantRaw.trim()
      ? merchantRaw.trim()
      : undefined;

  const totalRaw = pick(obj, ['total', 'montant', 'montant_total', 'total_ttc', 'amount', 'prix', 'sum']);
  const total = normalizeTotal(totalRaw);

  const dateRaw = pick(obj, ['date', 'date_achat', 'jour', 'purchase_date']);
  const date = normalizeDate(dateRaw);

  console.debug('[ai-receipt] extraction :', { merchant, total, date });

  return {
    merchant,
    date,
    total,
    confidence: {
      merchant: merchant ? 1 : 0,
      date: date ? 1 : 0,
      total: total ? 1 : 0,
    },
    rawLines: [], // pas de lignes OCR — c'est une extraction IA
  };
}
