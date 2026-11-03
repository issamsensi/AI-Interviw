/**
 * Live (streaming) speech recognition for the interview room.
 *
 * Unlike the record -> transcribe -> send pipeline, this uses the
 * browser SpeechRecognition API with interim results so the candidate
 * sees their words appear in the chat bubble while they are still
 * speaking — like a live conversation, not a voice recording.
 *
 * Pure helpers are separated from the browser API so they are
 * unit-testable without a microphone.
 */

/** Join committed (final) words with the still-changing interim tail. */
export function mergeLiveTranscript(finalText: string, interim: string): string {
  const committed = finalText.trim();
  const tail = interim.trim();
  if (!committed) return tail;
  if (!tail) return committed;
  return `${committed} ${tail}`;
}

/** Should an ended live transcript be auto-sent? Only real words count. */
export function isSendableTranscript(text: string): boolean {
  return text.trim().length > 0;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function liveSpeechSupported(): boolean {
  return getCtor() !== null;
}

export interface LiveRecognizer {
  stop: () => void;
  abort: () => void;
}

/**
 * Start one live listening session. `onUpdate` fires with the merged
 * transcript every time words arrive (interim and final). `onFinal`
 * fires when a chunk is committed. Returns null when unsupported.
 */
export function createLiveRecognizer(handlers: {
  onUpdate: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  lang?: string;
}): LiveRecognizer | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = handlers.lang ?? "en-US";

  let committed = "";
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        committed = mergeLiveTranscript(committed, result[0].transcript);
        handlers.onFinal?.(committed);
      } else {
        interim = mergeLiveTranscript(interim, result[0].transcript);
      }
    }
    handlers.onUpdate(mergeLiveTranscript(committed, interim));
  };
  recognition.onerror = (event) => handlers.onError?.(event.error ?? "speech-error");
  recognition.onend = () => handlers.onEnd?.();
  try {
    recognition.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      try { recognition.stop(); } catch { /* already stopped */ }
    },
    abort: () => {
      try { recognition.abort(); } catch { /* already stopped */ }
    },
  };
}
