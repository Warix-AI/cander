/**
 * Browser speech-to-text for composer dictation and voice mode.
 * Cap iOS may use the same Web Speech path when available in WKWebView.
 */

export type SpeechToTextHandlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechToTextSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export type SpeechSession = {
  stop: () => void;
};

export function startSpeechToText(
  handlers: SpeechToTextHandlers,
  opts?: { continuous?: boolean; lang?: string },
): SpeechSession | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    handlers.onError?.("Speech recognition is not supported in this browser.");
    return null;
  }

  const recognition = new Ctor();
  recognition.continuous = opts?.continuous ?? false;
  recognition.interimResults = true;
  recognition.lang = opts?.lang ?? "en-US";

  let stopped = false;

  recognition.onresult = (event) => {
    let interim = "";
    let finalChunk = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const piece = result?.[0]?.transcript ?? "";
      if (result.isFinal) finalChunk += piece;
      else interim += piece;
    }
    if (interim.trim()) handlers.onPartial?.(interim.trim());
    if (finalChunk.trim()) handlers.onFinal?.(finalChunk.trim());
  };

  recognition.onerror = (event) => {
    const code = event.error || "error";
    if (code === "aborted" || code === "no-speech") return;
    handlers.onError?.(
      code === "not-allowed"
        ? "Microphone permission was denied."
        : `Speech recognition error (${code}).`,
    );
  };

  recognition.onend = () => {
    if (!stopped) handlers.onEnd?.();
  };

  try {
    recognition.start();
  } catch (err) {
    handlers.onError?.(
      err instanceof Error ? err.message : "Could not start speech recognition.",
    );
    return null;
  }

  return {
    stop: () => {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
