// ===========================================================================
// Voix : Speech-to-Text (reconnaissance) et Text-to-Speech (synthèse).
//
// Utilise l'API Web Speech native du navigateur : AUCUNE dépendance réseau,
// AUCUNE librairie externe. STT via SpeechRecognition, TTS via
// speechSynthesis.
//
// Support variable selon les navigateurs : non disponible sur Firefox ni
// Safari iOS < 14.5. isSTTSupported() / isTTSSupported() permettent de le
// vérifier à l'exécution.
// ===========================================================================

// ---------------------------------------------------------------------------
// Déclarations de types (les API Web Speech ne sont pas dans TS par défaut)
// ---------------------------------------------------------------------------

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ---------------------------------------------------------------------------
// STT (Speech-to-Text)
// ---------------------------------------------------------------------------

/** true si la reconnaissance vocale est supportée par le navigateur. */
export function isSTTSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface STTCallbacks {
  /** Texte intermédiaire (pendant l'écoute). */
  onInterim?: (text: string) => void;
  /** Texte final (segment stabilisé). */
  onFinal?: (text: string) => void;
  /** Fin de l'écoute (stop ou silence prolongé). */
  onEnd?: () => void;
  /** Erreur. */
  onError?: (message: string) => void;
}

/**
 * Démarre une session de reconnaissance vocale en français.
 * @returns un contrôleur avec stop().
 */
export function startListening(
  callbacks: STTCallbacks,
  lang = 'fr-FR',
): { stop: () => void } {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    callbacks.onError?.('Reconnaissance vocale non supportée par ce navigateur.');
    return { stop: () => {} };
  }

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        callbacks.onFinal?.(res[0].transcript.trim());
      } else {
        interim += res[0].transcript;
      }
    }
    if (interim) callbacks.onInterim?.(interim);
  };

  recognition.onerror = (e) => {
    callbacks.onError?.(e.error === 'not-allowed'
      ? 'Microphone bloqué. Autorisez l\'accès dans le navigateur.'
      : `Erreur vocale : ${e.error}`);
  };

  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  try {
    recognition.start();
  } catch (e) {
    callbacks.onError?.((e as Error).message);
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* déjà arrêtée */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// TTS (Text-to-Speech)
// ---------------------------------------------------------------------------

/** true si la synthèse vocale est supportée. */
export function isTTSSupported(): boolean {
  return typeof window.speechSynthesis !== 'undefined';
}

/** Lit un texte à voix haute (fr-FR). Coupe toute lecture en cours. */
export function speak(text: string, lang = 'fr-FR'): void {
  if (!isTTSSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 1;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

/** Arrête toute lecture vocale en cours. */
export function stopSpeaking(): void {
  if (isTTSSupported()) window.speechSynthesis.cancel();
}
