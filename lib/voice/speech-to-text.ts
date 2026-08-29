/**
 * Speech-to-text for composer dictation and voice mode.
 * Cap native prefers SpeechRecognition plugin; web/desktop uses Web Speech API.
 */

import { isMobileShell } from "@/lib/mobile-shell";

export type SpeechToTextHandlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

export type SpeechSession = {
  stop: () => void;
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

type CapSpeechPlugin = {
  available?: () => Promise<{ available: boolean }>;
  requestPermissions?: () => Promise<{ speechRecognition?: string }>;
  checkPermissions?: () => Promise<{ speechRecognition?: string }>;
  start: (opts: Record<string, unknown>) => Promise<void>;
  stop: () => Promise<void>;
  addListener: (
    event: string,
    cb: (data: { matches?: string[] }) => void,
  ) => Promise<{ remove: () => void }> | { remove: () => void };
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function getCapSpeech(): CapSpeechPlugin | null {
  if (typeof window === "undefined" || !isMobileShell()) return null;
  const cap = (
    window as Window & {
      Capacitor?: { Plugins?: { SpeechRecognition?: CapSpeechPlugin } };
    }
  ).Capacitor;
  const plugin = cap?.Plugins?.SpeechRecognition;
  return plugin?.start ? plugin : null;
}

export function isSpeechToTextSupported(): boolean {
  return Boolean(getCapSpeech() || getSpeechRecognitionCtor());
}

function mapWebSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was denied. Allow mic access for this site or app, then try again.";
    case "network":
      return "Speech recognition needs a network connection (browser cloud speech). Check connectivity, or type instead.";
    case "audio-capture":
      return "No microphone was found.";
    case "language-not-supported":
      return "This language isn’t supported for speech recognition.";
    default:
      return `Speech recognition error (${code}).`;
  }
}

async function ensureMicPermission(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return null;
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Microphone permission was denied. Allow mic access, then try again.";
    }
    if (name === "NotFoundError") {
      return "No microphone was found.";
    }
    return null;
  }
}

async function startCapSpeech(
  handlers: SpeechToTextHandlers,
  opts?: { continuous?: boolean; lang?: string },
): Promise<SpeechSession | null> {
  const Speech = getCapSpeech();
  if (!Speech) return null;

  try {
    if (Speech.available) {
      const { available } = await Speech.available();
      if (!available) {
        handlers.onError?.(
          "Speech recognition isn’t available on this device.",
        );
        return null;
      }
    }
    if (Speech.requestPermissions) {
      const perms = await Speech.requestPermissions();
      if (perms.speechRecognition === "denied") {
        handlers.onError?.(
          "Microphone / speech permission was denied. Enable it in Settings.",
        );
        return null;
      }
    }
  } catch {
    /* continue — some builds lack permission helpers */
  }

  let stopped = false;
  const removes: Array<() => void> = [];

  const bind = async (
    event: string,
    cb: (data: { matches?: string[] }) => void,
  ) => {
    try {
      const handle = await Speech.addListener(event, cb);
      removes.push(() => {
        try {
          handle.remove();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  };

  await bind("partialResults", (data) => {
    const text = data.matches?.[0]?.trim();
    if (text) handlers.onPartial?.(text);
  });
  await bind("listeningState", () => {
    /* no-op — keep session alive */
  });

  try {
    await Speech.start({
      language: opts?.lang ?? "en-US",
      maxResults: 1,
      prompt: "Speak now",
      partialResults: true,
      popup: false,
    });
  } catch (err) {
    for (const remove of removes) remove();
    handlers.onError?.(
      err instanceof Error
        ? err.message
        : "Could not start speech recognition.",
    );
    return null;
  }

  // Cap plugin often delivers finals via partialResults stream; on stop, end.
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      void Speech.stop()
        .catch(() => undefined)
        .finally(() => {
          for (const remove of removes) remove();
          handlers.onEnd?.();
        });
    },
  };
}

function startWebSpeech(
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
    handlers.onError?.(mapWebSpeechError(code));
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

/**
 * Start recognition. Prefers Cap SpeechRecognition on native; else Web Speech.
 * Requests mic access first so permission prompts are clearer.
 */
export function startSpeechToText(
  handlers: SpeechToTextHandlers,
  opts?: { continuous?: boolean; lang?: string },
): SpeechSession | null {
  // Async preflight — return a session that cancels if permission fails mid-start.
  let inner: SpeechSession | null = null;
  let cancelled = false;

  void (async () => {
    const micError = await ensureMicPermission();
    if (cancelled) return;
    if (micError) {
      handlers.onError?.(micError);
      handlers.onEnd?.();
      return;
    }

    if (isMobileShell() && getCapSpeech()) {
      inner = await startCapSpeech(handlers, opts);
      if (cancelled) {
        inner?.stop();
        return;
      }
      if (inner) return;
    }

    if (cancelled) return;
    inner = startWebSpeech(handlers, opts);
    if (!inner && !cancelled) {
      handlers.onEnd?.();
    }
  })();

  return {
    stop: () => {
      cancelled = true;
      inner?.stop();
    },
  };
}
