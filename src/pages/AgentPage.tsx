// ===========================================================================
// Page Agent : conversation avec l'assistant (boucle ReAct multimodale).
// Saisie texte + pièces jointes (image/audio/pdf/docx) + voix (STT).
// Les dépenses ajoutées par l'agent apparaissent partout dans l'app.
// ===========================================================================

import { useEffect, useRef, useState } from 'react';
import { Send, Mic, Paperclip, X, Sparkles, Loader2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ChatMessageView } from '@/components/ChatMessage';
import { useToast } from '@/components/ui';
import { useStore } from '@/hooks/useStore';
import { useSpeech } from '@/hooks/useSpeech';
import { getSetting } from '@/lib/db';
import { runAgent } from '@/lib/agent';
import { fileToAttachment } from '@/lib/documents';
import { hasApiKey } from '@/lib/gemini';
import type { Attachment, ChatMessage } from '@/types';

const SUGGESTIONS = [
  'Ajoute 24,90 € chez Carrefour',
  "Combien j'ai dépensé ce mois-ci ?",
  'Liste mes dépenses de la semaine',
  'Définis un budget de 400 € pour Alimentation',
];

export function AgentPage() {
  const { toast } = useToast();
  const { transactions } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { sttSupported, listening, interim, toggleListen, speakOut } =
    useSpeech();

  // Charge la préférence TTS.
  useEffect(() => {
    (async () => {
      setTtsEnabled((await getSetting('ttsEnabled')) ?? false);
    })();
  }, []);

  // Scroll auto vers le bas à chaque nouveau message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, interim]);

  // --- Pièces jointes -------------------------------------------------------

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const built = await Promise.all(
        Array.from(files).map(fileToAttachment),
      );
      setAttachments((prev) => [...prev, ...built]);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // --- Envoi ----------------------------------------------------------------

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if ((!content && attachments.length === 0) || busy) return;

    if (!hasApiKey()) {
      toast('Ajoutez votre clé Gemini dans les Réglages.', 'warning');
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      createdAt: Date.now(),
      text: content,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    const pendingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'model',
      createdAt: Date.now(),
      pending: true,
    };

    // Historique précédent (sans le tour courant).
    const history = messages;
    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput('');
    setAttachments([]);
    setBusy(true);

    try {
      const result = await runAgent({
        history,
        userText: content,
        attachments: userMsg.attachments ?? [],
        onStep: (step) => {
          // Mise à jour progressive de la trace du message en cours.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingMsg.id
                ? { ...m, steps: [...(m.steps ?? []), step] }
                : m,
            ),
          );
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? {
                ...m,
                pending: false,
                text: result.text,
                steps: result.steps,
                error: result.error,
              }
            : m,
        ),
      );

      if (ttsEnabled && result.text) speakOut(result.text);
      if (result.error) toast("L'agent a rencontré un problème.", 'error');
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, pending: false, error: (e as Error).message }
            : m,
        ),
      );
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function onMic() {
    toggleListen((finalText) => {
      // On accumule le texte transcrit dans l'input.
      setInput((prev) => (prev ? `${prev} ${finalText}` : finalText));
    });
  }

  const txCount = transactions.length;

  return (
    <Layout title="Agent">
      <div className="flex h-[calc(100vh-9rem)] flex-col sm:h-[calc(100vh-3.5rem)]">
        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-2">
          {messages.length === 0 ? (
            <Welcome txCount={txCount} onPick={(s) => void send(s)} />
          ) : (
            messages.map((m) => (
              <ChatMessageView
                key={m.id}
                msg={m}
                ttsEnabled={ttsEnabled}
                onSpeak={speakOut}
              />
            ))
          )}
          {busy && (
            <div className="flex items-center gap-2 pl-11 text-xs text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              L'agent réfléchit…
            </div>
          )}
        </div>

        {/* Pièces jointes sélectionnées */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-1 py-2 dark:border-slate-800">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative flex items-center gap-1.5 rounded-lg bg-slate-100 py-1 pl-2 pr-6 text-xs dark:bg-slate-800"
              >
                <span className="max-w-[140px] truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-1 rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  aria-label="Retirer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Transcription en cours */}
        {listening && interim && (
          <p className="px-1 py-1 text-xs italic text-slate-400">« {interim} »</p>
        )}

        {/* Barre de saisie */}
        <div className="flex items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,audio/*,application/pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              void onPickFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-ghost shrink-0 p-2.5"
            aria-label="Joindre un fichier"
            title="Image, audio, PDF, DOCX"
          >
            <Paperclip size={18} />
          </button>

          {sttSupported && (
            <button
              onClick={onMic}
              className={`btn-ghost shrink-0 p-2.5 ${listening ? 'text-red-500' : ''}`}
              aria-label={listening ? "Arrêter l'écoute" : 'Parler'}
              title="Saisie vocale"
            >
              <Mic size={18} />
            </button>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Décrivez une dépense, joignez un reçu…"
            className="input max-h-32 flex-1 resize-none"
            disabled={busy}
          />

          <button
            onClick={() => void send()}
            disabled={busy || (!input.trim() && attachments.length === 0)}
            className="btn-primary shrink-0 p-2.5"
            aria-label="Envoyer"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Écran d'accueil
// ---------------------------------------------------------------------------

function Welcome({
  txCount,
  onPick,
}: {
  txCount: number;
  onPick: (s: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white">
        <Sparkles size={30} />
      </div>
      <div>
        <h2 className="text-lg font-bold">Bonjour 👋</h2>
        <p className="mt-1 text-sm text-slate-500">
          Je suis votre assistant de dépenses. Parlez-moi, montrez-moi un reçu,
          ou envoyez-moi un document : je m'occupe du reste.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          {txCount} dépense{txCount > 1 ? 's' : ''} enregistrée{txCount > 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="card w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700 dark:text-slate-200 dark:hover:text-brand-300"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
