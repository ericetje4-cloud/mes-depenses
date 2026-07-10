// ===========================================================================
// ChatMessage : rendu d'un message de conversation (user ou model).
// Inclut les pièces jointes (côté user), le texte, la trace ReAct (côté
// modèle) et la lecture vocale optionnelle.
// ===========================================================================

import { Sparkles, User, FileText, File, AlertTriangle, Volume2 } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/types';
import { AgentTrace } from './AgentTrace';
import { formatTime, formatBytes } from '@/lib/format';

export function ChatMessageView({
  msg,
  ttsEnabled,
  onSpeak,
}: {
  msg: ChatMessageType;
  ttsEnabled: boolean;
  onSpeak: (text: string) => void;
}) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
            : 'bg-brand-600 text-white'
        }`}
      >
        {isUser ? <User size={16} /> : <Sparkles size={16} />}
      </div>

      {/* Bulle */}
      <div className={`min-w-0 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Pièces jointes (user) */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {msg.attachments.map((a) => (
              <AttachmentChip key={a.id} name={a.name} kind={a.kind} thumbnail={a.thumbnail} size={a.size} />
            ))}
          </div>
        )}

        {/* Texte */}
        {msg.text && (
          <div
            className={`rounded-2xl px-3.5 py-2.5 text-sm ${
              isUser
                ? 'bg-brand-600 text-white'
                : 'bg-white shadow-card dark:bg-slate-900 dark:text-slate-100'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
          </div>
        )}

        {/* Trace ReAct (model) */}
        {!isUser && msg.steps && msg.steps.length > 0 && <AgentTrace steps={msg.steps} />}

        {/* Erreur */}
        {msg.error && (
          <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <AlertTriangle size={14} />
            <span>{msg.error}</span>
          </div>
        )}

        {/* Pied : horodatage + lecture vocale */}
        <div className={`mt-1 flex items-center gap-2 text-[10px] text-slate-400 ${isUser ? 'justify-end' : ''}`}>
          <span>{formatTime(msg.createdAt)}</span>
          {!isUser && msg.text && ttsEnabled && (
            <button
              onClick={() => onSpeak(msg.text!)}
              className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Lire à voix haute"
            >
              <Volume2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({
  name,
  kind,
  thumbnail,
  size,
}: {
  name: string;
  kind: string;
  thumbnail?: string;
  size: number;
}) {
  if (kind === 'image' && thumbnail) {
    return (
      <img
        src={thumbnail}
        alt={name}
        className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
      />
    );
  }
  const Icon = kind === 'pdf' || kind === 'docx' ? File : FileText;
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <Icon size={14} />
      <span className="max-w-[120px] truncate">{name}</span>
      <span className="text-[10px] text-slate-400">{formatBytes(size)}</span>
    </div>
  );
}
