// ===========================================================================
// Hook React pour la voix : écoute (STT) + lecture (TTS).
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSTTSupported,
  isTTSSupported,
  startListening,
  speak,
  stopSpeaking,
} from '@/lib/speech';

export interface UseSpeech {
  /** true si STT est supporté. */
  sttSupported: boolean;
  /** true si TTS est supporté. */
  ttsSupported: boolean;
  /** true si l'écoute est en cours. */
  listening: boolean;
  /** Texte intermédiaire pendant l'écoute. */
  interim: string;
  /** Démarre / arrête l'écoute vocale. */
  toggleListen: (onFinal: (text: string) => void) => void;
  /** Lit un texte à voix haute. */
  speakOut: (text: string) => void;
  /** Arrête la lecture vocale. */
  stopSpeak: () => void;
}

export function useSpeech(): UseSpeech {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const ctrlRef = useRef<{ stop: () => void } | null>(null);

  const sttSupported = isSTTSupported();
  const ttsSupported = isTTSSupported();

  // Nettoyage au démontage : on arrête l'écoute et la lecture.
  useEffect(() => {
    return () => {
      ctrlRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  const toggleListen = useCallback(
    (onFinal: (text: string) => void) => {
      if (listening) {
        ctrlRef.current?.stop();
        ctrlRef.current = null;
        setListening(false);
        setInterim('');
        return;
      }
      setListening(true);
      setInterim('');
      ctrlRef.current = startListening({
        onInterim: (t) => setInterim(t),
        onFinal: (t) => {
          if (t) onFinal(t);
          setInterim('');
        },
        onEnd: () => {
          setListening(false);
          setInterim('');
        },
        onError: (msg) => {
          setListening(false);
          setInterim('');
          console.warn('[speech]', msg);
        },
      });
    },
    [listening],
  );

  const speakOut = useCallback((text: string) => {
    speak(text);
  }, []);

  const stopSpeak = useCallback(() => {
    stopSpeaking();
  }, []);

  return {
    sttSupported,
    ttsSupported,
    listening,
    interim,
    toggleListen,
    speakOut,
    stopSpeak,
  };
}
