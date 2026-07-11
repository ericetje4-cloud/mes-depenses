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

// Schéma JSON attendu en sortie de Gemini (documenté dans le prompt).
interface AIReceiptResult {
  merchant?: string;
  total?: number;
  date?: string; // AAAA-MM-JJ
}

/** Prompt system : rôle + consignes d'extraction. */
const SYSTEM_PROMPT = `Tu es un extracteur de tickets de caisse. Analyse l'image du reçu fournie et extrais ces champs :
- "merchant" : nom du commerçant/enseigne (texte court, sans adresse ni téléphone)
- "total" : montant TOTAL à payer (nombre décimal en euros, ex: 24.90 — sans le symbole € ni la devise)
- "date" : date d'achat au format AAAA-MM-JJ (déduis l'année si absente ; si introuvable, omet le champ)

Réponds UNIQUEMENT avec un objet JSON valide, rien d'autre. Si un champ est illisible ou absent, ne l'inclus pas.
Exemple : {"merchant":"Carrefour","total":24.90,"date":"2026-07-12"}`;

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
          { text: 'Extrails les informations de ce ticket.' },
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

  if (!rawText) {
    throw new Error('Gemini n\'a renvoyé aucun texte.');
  }

  // Le modèle peut envelopper le JSON dans des ```json ... ``` ; on nettoie.
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: AIReceiptResult;
  try {
    parsed = JSON.parse(cleaned) as AIReceiptResult;
  } catch {
    throw new Error('Réponse Gemini illisible (JSON invalide).');
  }

  // Construit le ParsedReceipt avec indices de confiance binaires.
  const merchant =
    typeof parsed.merchant === 'string' && parsed.merchant.trim()
      ? parsed.merchant.trim()
      : undefined;
  const total =
    typeof parsed.total === 'number' && Number.isFinite(parsed.total) && parsed.total > 0
      ? Math.round(parsed.total * 100) / 100
      : undefined;
  const date =
    typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : undefined;

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
