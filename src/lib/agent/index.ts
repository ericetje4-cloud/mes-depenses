// ===========================================================================
// Moteur de l'agent : boucle ReAct (Thought → Action → Observation).
//
// Principe :
//   1. On envoie à Gemini le contexte (historique + message courant + pièces
//      jointes multimodales) et les tools disponibles.
//   2. Si le modèle demande un functionCall → on exécute le tool → on injecte
//      le résultat (observation) → on reboucle.
//   3. Si le modèle produit du texte → c'est la réponse finale, on arrête.
//   4. Garde-fou : max MAX_ITERATIONS itérations pour éviter une boucle infinie.
//
// On notifie chaque étape via un callback onStep (pour l'UI AgentTrace).
// ===========================================================================

import {
  generateContent,
  parseResponse,
  inlineFromDataURL,
  hasApiKey,
  type GeminiContent,
  type GeminiFunctionDeclaration,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from '@/lib/gemini';
import { TOOL_HANDLERS, TOOL_DECLARATIONS } from '@/lib/agent/tools';
import type { ToolContext } from '@/lib/agent/tools';
import type {
  AgentStep,
  Attachment,
  ChatMessage,
} from '@/types';

/** Nombre max d'aller-retours (tour modèle + exécution tool). */
const MAX_ITERATIONS = 8;

/** Instruction système : rôle et consignes de l'agent. */
const SYSTEM_INSTRUCTION = `Tu es "Agent Dépenses", un assistant expert en gestion des dépenses personnelles, en français.

RÔLE :
- Aider l'utilisateur à enregistrer, rechercher, catégoriser et analyser ses dépenses.
- Comprendre des tickets de caisse et factures (images, PDF), des notes vocales transcrites et des documents (DOCX).

CONSIGNES :
- Réfléchis étape par étape. Utilise les outils disponibles (function calling) pour lire et écrire dans la base plutôt que d'inventer des données.
- Pour ajouter une dépense depuis une image ou un document : extrais montant, marchand, date, puis appelle add_expense. Si une info est ambiguë, demande confirmation à l'utilisateur.
- Quand tu n'as pas de pièce jointe mais que l'utilisateur décrit une dépense ("j'ai dépensé 12€ chez Carrefour"), utilise directement add_expense.
- Sois concis et amical. Réponds en français. Montre les montants au format "12,50 €".
- Si l'utilisateur demande un résumé ou "combien j'ai dépensé", utilise get_summary ou search_transactions.
- Ne confonds jamais euros et autres devises ; si doute, demande.`;

// ---------------------------------------------------------------------------
// Construction du contenu multimodal d'un message utilisateur
// ---------------------------------------------------------------------------

/** Construit les parts Gemini d'un message utilisateur (texte + pièces jointes). */
function buildUserParts(
  text: string,
  attachments: Attachment[],
): GeminiContent['parts'] {
  const parts: GeminiContent['parts'] = [];
  if (text.trim()) parts.push({ text });

  for (const att of attachments) {
    if (att.kind === 'text' || att.kind === 'docx') {
      // Texte déjà extrait : on l'envoie comme texte.
      parts.push({ text: `\n\n[Contenu de ${att.name}]\n${att.data}` });
    } else if (att.kind === 'image' || att.kind === 'audio' || att.kind === 'pdf') {
      // Multimédia : inlineData base64.
      try {
        const inline = inlineFromDataURL(att.data);
        parts.push({ inlineData: inline });
      } catch {
        parts.push({ text: `[Pièce jointe ${att.name} illisible]` });
      }
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Conversion de l'historique ChatMessage -> GeminiContent[]
// ---------------------------------------------------------------------------

/** Convertit un historique de ChatMessages en contenus Gemini. */
export function historyToContents(messages: ChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const msg of messages) {
    if (msg.pending || msg.error) continue;
    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: buildUserParts(msg.text ?? '', msg.attachments ?? []),
      });
    } else {
      // Message modèle : on ne renvoie que le texte final (pas la trace).
      if (msg.text) {
        contents.push({ role: 'model', parts: [{ text: msg.text }] });
      }
    }
  }
  return contents;
}

// ---------------------------------------------------------------------------
// Boucle ReAct principale
// ---------------------------------------------------------------------------

export interface RunAgentParams {
  /** Historique de la conversation (sans le tour courant). */
  history: ChatMessage[];
  /** Texte du message utilisateur courant. */
  userText: string;
  /** Pièces jointes du tour courant. */
  attachments: Attachment[];
  /** Callback appelé à chaque étape (thought/action/observation/answer). */
  onStep: (step: AgentStep) => void;
}

export interface RunAgentResult {
  /** Réponse finale (texte). */
  text: string;
  /** Trace complète des étapes. */
  steps: AgentStep[];
  /** Code d'erreur éventuel. */
  error?: string;
}

/**
 * Exécute la boucle ReAct pour un tour utilisateur.
 */
export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const { history, userText, attachments, onStep } = params;
  const steps: AgentStep[] = [];
  const tools: GeminiFunctionDeclaration[] = TOOL_DECLARATIONS;

  if (!hasApiKey()) {
    const err = 'Aucune clé API Gemini configurée. Ajoutez-la dans les Réglages.';
    const step: AgentStep = { type: 'answer', text: err };
    steps.push(step);
    onStep(step);
    return { text: err, steps, error: err };
  }

  // Contenu initial : historique + tour courant (multimodal).
  const baseContents = historyToContents(history);
  const userContent: GeminiContent = {
    role: 'user',
    parts: buildUserParts(userText, attachments),
  };

  let contents = [...baseContents, userContent];
  const toolCtx: ToolContext = {
    imageAttachments: attachments
      .filter((a) => a.kind === 'image')
      .map((a) => ({ data: a.data, name: a.name })),
  };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let resp;
    try {
      resp = await generateContent({
        contents,
        tools,
        systemInstruction: SYSTEM_INSTRUCTION,
      });
    } catch (e) {
      const msg = (e as Error).message;
      const step: AgentStep = { type: 'answer', text: `Erreur : ${msg}` };
      steps.push(step);
      onStep(step);
      return { text: '', steps, error: msg };
    }

    const { text, functionCalls } = parseResponse(resp);

    // Cas 1 : pas de function call → réponse finale (ou pensée avant réponse).
    if (functionCalls.length === 0) {
      // Si du texte intermédiaire existe (non final), on le garde comme pensée.
      if (text && iter > 0) {
        const step: AgentStep = { type: 'thought', text };
        steps.push(step);
        onStep(step);
      }
      const answer = text || "Je n'ai pas pu formuler de réponse.";
      const step: AgentStep = { type: 'answer', text: answer };
      steps.push(step);
      onStep(step);
      return { text: answer, steps };
    }

    // Le modèle peut produire du texte ET des function calls : c'est la pensée.
    if (text) {
      const step: AgentStep = { type: 'thought', text };
      steps.push(step);
      onStep(step);
    }

    // Cas 2 : function calls → exécuter les tools, injecter les observations.
    // On ajoute d'abord le contenu modèle tel quel (contenant les functionCall).
    contents = [...contents, { role: 'model', parts: resp.candidates?.[0]?.content?.parts ?? [] }];

    const responses: GeminiFunctionResponse[] = [];
    for (const call of functionCalls) {
      const actionStep: AgentStep = {
        type: 'action',
        toolName: call.name,
        args: call.args,
      };
      steps.push(actionStep);
      onStep(actionStep);

      const result = await executeTool(call, toolCtx);

      const obsStep: AgentStep = {
        type: 'observation',
        toolName: call.name,
        result,
      };
      steps.push(obsStep);
      onStep(obsStep);

      responses.push({
        name: call.name,
        response: { result },
      });
    }

    // On injecte les observations comme contenu "user" (rôle functionResponse).
    contents = [
      ...contents,
      {
        role: 'user',
        parts: responses.map((r) => ({ functionResponse: r })),
      },
    ];
  }

  // Garde-fou : trop d'itérations.
  const msg = "L'agent a dépassé le nombre maximum d'étapes de raisonnement.";
  const step: AgentStep = { type: 'answer', text: msg };
  steps.push(step);
  onStep(step);
  return { text: msg, steps, error: msg };
}

// ---------------------------------------------------------------------------
// Exécution d'un tool avec gestion d'erreur
// ---------------------------------------------------------------------------

async function executeTool(
  call: GeminiFunctionCall,
  ctx: ToolContext,
): Promise<string> {
  const handler = TOOL_HANDLERS[call.name];
  if (!handler) {
    return `Erreur : outil « ${call.name} » inconnu.`;
  }
  try {
    return await handler(call.args ?? {}, ctx);
  } catch (e) {
    return `Erreur lors de l'exécution de ${call.name} : ${(e as Error).message}`;
  }
}
