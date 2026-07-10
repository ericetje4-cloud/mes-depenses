// ===========================================================================
// Client Google Gemini (API generative-language REST).
// Multimodal natif : texte, image, audio, PDF (inlineData base64).
// Function calling (tools) pour la boucle ReAct de l'agent.
//
// ⚠️ La clé API est lue depuis : 1) un réglage IndexedDB (saisi par l'user)
//    ou 2) la variable d'env VITE_GEMINI_KEY au build.
//    En PWA statique, cette clé est visible dans le code. Acceptable pour une
//    clé gratuite AI Studio à quota limité — ne JAMAIS y mettre une clé payante.
//
// Doc : https://ai.google.dev/api/rest/v1beta/models/generateContent
// ===========================================================================

/** Modèle Gemini par défaut (multimodal + function calling, gratuit AI Studio). */
export const DEFAULT_MODEL = 'gemini-3.5-flash';

/** Modèles proposés dans les réglages. */
export const AVAILABLE_MODELS: { id: string; label: string; hint: string }[] = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', hint: 'Rapide, équilibré (recommandé)' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', hint: 'Plus précis, plus lent (preview)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', hint: 'Le plus rapide/économique' },
];

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60000; // 60s : les réponses multimodales peuvent être longues.

// ---------------------------------------------------------------------------
// Gestion de la clé API (2 niveaux : runtime > env build)
// ---------------------------------------------------------------------------

let runtimeKey: string | null = null;
let runtimeModel: string = DEFAULT_MODEL;

/** Définit la clé API en cours d'utilisation (depuis les réglages). */
export function setApiKey(key: string): void {
  runtimeKey = key.trim();
}

/** Définit le modèle Gemini à utiliser. */
export function setModel(model: string): void {
  runtimeModel = model.trim() || DEFAULT_MODEL;
}

/** Récupère la clé active : priorité runtime, puis variable d'env build. */
function apiKey(): string | null {
  if (runtimeKey && runtimeKey.length > 0) return runtimeKey;
  const envKey = import.meta.env.VITE_GEMINI_KEY as string | undefined;
  return envKey && envKey.length > 0 ? envKey : null;
}

/** true si une clé API est configurée. */
export function hasApiKey(): boolean {
  return apiKey() !== null;
}

// ---------------------------------------------------------------------------
// Types (sous-ensemble de l'API REST Gemini)
// ---------------------------------------------------------------------------

/** Un appel de fonction demandé par le modèle. */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/** Une partie de contenu (texte, multimédia inline, ou appel/réponse de tool). */
export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string }; // base64 sans préfixe data:
  // Présents quand on réinjecte les tours function calling dans contents.
  functionCall?: GeminiFunctionCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
}

/** Un message dans l'historique de conversation. */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Déclaration d'un tool (function calling) au format Gemini. */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>; // JSON Schema
}

/** Un résultat de fonction renvoyé au modèle. */
export interface GeminiFunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

/** Une partie de réponse parsée depuis le modèle. */
export type GeminiResponsePart =
  | { text: string }
  | { functionCall: GeminiFunctionCall };

export interface GeminiCandidate {
  content?: { parts?: GeminiResponsePart[] };
  finishReason?: string;
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

// ---------------------------------------------------------------------------
// Construction des parts multimodales depuis une data-URL
// ---------------------------------------------------------------------------

/** Convertit une data-URL en { mimeType, data } base64 pour Gemini. */
function inlineFromDataURL(dataUrl: string): { mimeType: string; data: string } {
  // Format : data:<mime>;base64,<data>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Format data-URL invalide');
  return { mimeType: match[1], data: match[2] };
}

// ---------------------------------------------------------------------------
// Appel REST generateContent
// ---------------------------------------------------------------------------

/** Options d'un appel generateContent. */
export interface GenerateOptions {
  /** Contenu du tour utilisateur courant. */
  contents: GeminiContent[];
  /** Déclarations de tools disponibles (function calling). */
  tools?: GeminiFunctionDeclaration[];
  /** Instruction système (rôle/personnalité). */
  systemInstruction?: string;
  /** Réponse au format JSON structuré (mode JSON). */
  jsonMode?: boolean;
  /** Température (0.0 - 2.0). Défaut auto. */
  temperature?: number;
}

/** Erreur typée renvoyée par le client Gemini. */
export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * Appelle l'endpoint generateContent de Gemini.
 * @returns La réponse parsée (candidates + parts).
 */
export async function generateContent(
  opts: GenerateOptions,
): Promise<GeminiResponse> {
  const key = apiKey();
  if (!key) {
    throw new GeminiError(
      'Aucune clé API Gemini configurée. Ajoutez-la dans les Réglages.',
    );
  }

  const url = `${BASE}/models/${runtimeModel}:generateContent?key=${encodeURIComponent(key)}`;

  const body: Record<string, unknown> = {
    contents: opts.contents,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = [{ functionDeclarations: opts.tools }];
  }
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }
  if (opts.jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }
  if (opts.temperature !== undefined) {
    body.generationConfig = {
      ...(body.generationConfig as object | undefined),
      temperature: opts.temperature,
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new GeminiError('La requête Gemini a expiré (60s).');
    }
    throw new GeminiError(
      'Réseau injoignable. Vérifiez votre connexion internet.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    let message = `Erreur Gemini (HTTP ${resp.status})`;
    try {
      const errBody = await resp.json();
      message = errBody?.error?.message ?? message;
    } catch {
      // ignore le parse error
    }
    throw new GeminiError(message, resp.status);
  }

  return (await resp.json()) as GeminiResponse;
}

// ---------------------------------------------------------------------------
// Helpers de parsing de réponse
// ---------------------------------------------------------------------------

/** Extrait les parts d'intérêt du premier candidat d'une réponse. */
export function parseResponse(
  resp: GeminiResponse,
): { parts: GeminiResponsePart[]; text: string; functionCalls: GeminiFunctionCall[] } {
  const candidate = resp.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((p) => ('text' in p ? p.text : ''))
    .filter(Boolean)
    .join('');
  const functionCalls = parts
    .filter((p): p is { functionCall: GeminiFunctionCall } => 'functionCall' in p)
    .map((p) => p.functionCall);
  return { parts, text, functionCalls };
}

// ---------------------------------------------------------------------------
// Test de clé (ping léger)
// ---------------------------------------------------------------------------

/**
 * Valide une clé API en deux temps pour distinguer les causes d'échec :
 *   1. Appel à ListModels (sans modèle) → valide la clé indépendamment de
 *      tout modèle. Permet de distinguer « clé invalide » de « modèle
 *      inaccessible ».
 *   2. Si la clé est valide, ping generateContent sur le modèle choisi pour
 *      vérifier qu'il est bien accessible avec cette clé.
 * @returns ok=true si la clé et le modèle fonctionnent, sinon ok=false avec
 *          un message précisant la cause.
 */
export async function testApiKey(
  key: string,
  model = DEFAULT_MODEL,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, message: 'Clé vide.' };

  // --- Étape 1 : validité de la clé (sans modèle) ---
  const keyCheck = await listModels(trimmed);
  if (!keyCheck.ok) {
    return { ok: false, message: keyCheck.message };
  }

  // Si le modèle choisi n'est pas dans la liste renvoyée par l'API, on ne
  // fait même pas le ping : l'appel échouerait. On l'indique clairement.
  const available = keyCheck.models.map((m) => m.id);
  if (!available.includes(model)) {
    // Suggestion : les 3 modèles generateContent les plus pertinents.
    const suggest = available.filter((m) => m.startsWith('gemini-')).slice(0, 3);
    return {
      ok: false,
      message: `Clé valide, mais le modèle « ${model} » n'est pas accessible. Essayez : ${suggest.join(', ') || available[0]}.`,
    };
  }

  // --- Étape 2 : ping du modèle choisi ---
  const url = `${BASE}/models/${model}:generateContent?key=${encodeURIComponent(trimmed)}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 400 || resp.status === 403) {
      const body = await resp.json().catch(() => null);
      return {
        ok: false,
        message: body?.error?.message ?? 'Modèle rejeté par Google.',
      };
    }
    return { ok: false, message: `Erreur HTTP ${resp.status}.` };
  } catch {
    return { ok: false, message: 'Réseau injoignable.' };
  }
}

/** Réexport pour construire des parts inline depuis une data-URL. */
export { inlineFromDataURL };

// ---------------------------------------------------------------------------
// Liste des modèles disponibles (interrogation live de l'API)
// ---------------------------------------------------------------------------

export interface GeminiModelInfo {
  /** Nom complet renvoyé par l'API, ex: "models/gemini-3.5-flash". */
  name: string;
  /** Nom court, ex: "gemini-3.5-flash". */
  id: string;
  /** Méthodes supportées (ex: generateContent). */
  methods: string[];
}

/**
 * Interroge Google pour lister les modèles accessibles avec la clé donnée.
 * On ne garde que ceux qui supportent generateContent (utilisables par l'agent).
 */
export async function listModels(
  key: string,
): Promise<{ ok: true; models: GeminiModelInfo[] } | { ok: false; message: string }> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, message: 'Clé vide.' };
  const url = `${BASE}/models?key=${encodeURIComponent(trimmed)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      return { ok: false, message: body?.error?.message ?? `Erreur HTTP ${resp.status}` };
    }
    const data = await resp.json();
    const all = (data?.models ?? []) as {
      name: string;
      supportedGenerationMethods?: string[];
    }[];
    const models: GeminiModelInfo[] = all
      .filter(
        (m) =>
          m.supportedGenerationMethods?.includes('generateContent') &&
          typeof m.name === 'string',
      )
      .map((m) => ({
        name: m.name,
        id: m.name.replace(/^models\//, ''),
        methods: m.supportedGenerationMethods ?? [],
      }));
    return { ok: true, models };
  } catch {
    return { ok: false, message: 'Réseau injoignable.' };
  }
}

