/**
 * Speech-to-text for composer dictation and voice mode.
 *
 * Routing (checked in order):
 * 1. Electron desktop shell → native macOS Speech bridge (never Web Speech)
 * 2. Capacitor native → SpeechRecognition plugin (Apple Speech on iOS)
 * 3. Web browser → Web Speech API (no native dictation)
 */

import { isDesktopShell } from "@/lib/desktop-shell";
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

type DesktopSpeechBridge = {
  available?: () => Promise<{
    available?: boolean;
    supportsOnDeviceRecognition?: boolean;
    message?: string;
  }>;
  start?: (opts?: { lang?: string; continuous?: boolean }) => Promise<{
    ok?: boolean;
    message?: string;
  }>;
  stop?: () => Promise<void>;
  onEvent?: (
    handler: (event: {
      type?: string;
      text?: string;
      message?: string;
    }) => void,
  ) => () => void;
};

type CapBridge = {
  isNativePlatform?: () => boolean;
  registerPlugin?: <T>(name: string) => T;
  Plugins?: { SpeechRecognition?: CapSpeechPlugin };
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  // Electron must never use browser/cloud speech — even if Chromium exposes it.
  if (typeof window === "undefined" || isDesktopShell()) return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function getCapacitor(): CapBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapBridge }).Capacitor;
}

function getCapSpeech(): CapSpeechPlugin | null {
  if (!isMobileShell()) return null;
  const cap = getCapacitor();
  if (!cap) return null;

  const existing = cap.Plugins?.SpeechRecognition;
  if (existing?.start) return existing;

  if (typeof cap.registerPlugin === "function") {
    try {
      const registered = cap.registerPlugin<CapSpeechPlugin>("SpeechRecognition");
      if (registered?.start) return registered;
    } catch {
      /* fall through */
    }
  }
  return null;
}

function getDesktopSpeech(): DesktopSpeechBridge | null {
  if (typeof window === "undefined" || !isDesktopShell()) return null;
  const bridge = (
    window as Window & {
      canderDesktop?: { speech?: DesktopSpeechBridge };
    }
  ).canderDesktop;
  const speech = bridge?.speech;
  if (!speech?.start || !speech?.stop) return null;
  return speech;
}

/** True when the current host can start dictation on the preferred path. */
export function isSpeechToTextSupported(): boolean {
  if (isDesktopShell()) return Boolean(getDesktopSpeech());
  if (isMobileShell()) return Boolean(getCapSpeech());
  return Boolean(getSpeechRecognitionCtor());
}

export function resolveSpeechToTextRoute():
  | "electron"
  | "capacitor"
  | "web"
  | "none" {
  if (isDesktopShell()) return getDesktopSpeech() ? "electron" : "none";
  if (isMobileShell()) return getCapSpeech() ? "capacitor" : "none";
  return getSpeechRecognitionCtor() ? "web" : "none";
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

async function startDesktopSpeech(
  handlers: SpeechToTextHandlers,
  opts?: { continuous?: boolean; lang?: string },
): Promise<SpeechSession | null> {
  const speech = getDesktopSpeech();
  if (!speech?.start || !speech.stop) {
    handlers.onError?.(
      "Native macOS speech isn’t available in this desktop build.",
    );
    return null;
  }

  if (speech.available) {
    try {
      const avail = await speech.available();
      if (!avail.available) {
        handlers.onError?.(
          avail.message || "Speech recognition isn’t available on this Mac.",
        );
        return null;
      }
    } catch {
      /* continue — start may still work */
    }
  }

  let stopped = false;
  const unsubscribe = speech.onEvent?.((event) => {
    if (stopped) return;
    const type = event.type || "";
    if (type === "partial" && event.text?.trim()) {
      handlers.onPartial?.(event.text.trim());
      return;
    }
    if (type === "final" && event.text?.trim()) {
      handlers.onFinal?.(event.text.trim());
      return;
    }
    if (type === "error") {
      handlers.onError?.(event.message || "Speech recognition failed.");
      return;
    }
    if (type === "end") {
      handlers.onEnd?.();
    }
  });

  try {
    const res = await speech.start({
      lang: opts?.lang ?? "en-US",
      continuous: opts?.continuous ?? true,
    });
    if (res && res.ok === false) {
      unsubscribe?.();
      handlers.onError?.(res.message || "Could not start native speech.");
      return null;
    }
  } catch (err) {
    unsubscribe?.();
    handlers.onError?.(
      err instanceof Error ? err.message : "Could not start native speech.",
    );
    return null;
  }

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      void speech
        .stop?.()
        .catch(() => undefined)
        .finally(() => {
          unsubscribe?.();
          handlers.onEnd?.();
        });
    },
  };
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
  if (isDesktopShell()) {
    handlers.onError?.(
      "Electron must use native macOS speech — browser speech is disabled.",
    );
    return null;
  }

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
 * Start recognition on the host-preferred path.
 * Electron never falls through to SpeechRecognition / webkitSpeechRecognition.
 */
export function startSpeechToText(
  handlers: SpeechToTextHandlers,
  opts?: { continuous?: boolean; lang?: string },
): SpeechSession | null {
  let inner: SpeechSession | null = null;
  let cancelled = false;

  void (async () => {
    // Desktop shell wins before any browser feature detection.
    if (isDesktopShell()) {
      if (cancelled) return;
      inner = await startDesktopSpeech(handlers, opts);
      if (cancelled) {
        inner?.stop();
        return;
      }
      if (!inner) handlers.onEnd?.();
      return;
    }

    if (isMobileShell()) {
      const micError = await ensureMicPermission();
      if (cancelled) return;
      if (micError) {
        handlers.onError?.(micError);
        handlers.onEnd?.();
        return;
      }
      if (getCapSpeech()) {
        inner = await startCapSpeech(handlers, opts);
        if (cancelled) {
          inner?.stop();
          return;
        }
        if (inner) return;
      }
      handlers.onError?.(
        "Native speech isn’t available in this build. Sync the mobile app and rebuild.",
      );
      handlers.onEnd?.();
      return;
    }

    // Web only
    const micError = await ensureMicPermission();
    if (cancelled) return;
    if (micError) {
      handlers.onError?.(micError);
      handlers.onEnd?.();
      return;
    }
    inner = startWebSpeech(handlers, opts);
    if (!inner && !cancelled) handlers.onEnd?.();
  })();

  return {
    stop: () => {
      cancelled = true;
      inner?.stop();
    },
  };
}
