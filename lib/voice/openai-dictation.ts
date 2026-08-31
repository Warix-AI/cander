/**
 * OpenAI-only dictation for RAW_OPENAI_MODE.
 * Records mic audio → /api/ai/raw-openai/transcribe → transcript text.
 * Does not use Apple Speech, Electron SpeechHelper, or Web Speech.
 */

import { transcribeRawOpenAIAudio } from "@/lib/ai/raw-openai/upload-client";
import type { SpeechSession, SpeechToTextHandlers } from "@/lib/voice/speech-to-text";

export function isOpenAIDictationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

export function startOpenAIDictation(
  handlers: SpeechToTextHandlers,
): SpeechSession {
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: BlobPart[] = [];
  let stopped = false;

  const cleanup = () => {
    try {
      mediaRecorder?.stop();
    } catch {
      /* ignore */
    }
    mediaRecorder = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    chunks = [];
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
      mediaRecorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunks = [];
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      mediaRecorder.onerror = () => {
        handlers.onError?.("Microphone recording failed.");
        cleanup();
        handlers.onEnd?.();
      };
      mediaRecorder.start(250);
    } catch {
      handlers.onError?.(
        "Microphone permission is required for voice dictation.",
      );
      cleanup();
      handlers.onEnd?.();
    }
  })();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      const recorder = mediaRecorder;
      const activeStream = stream;
      if (!recorder || recorder.state === "inactive") {
        activeStream?.getTracks().forEach((t) => t.stop());
        handlers.onEnd?.();
        return;
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        activeStream?.getTracks().forEach((t) => t.stop());
        mediaRecorder = null;
        stream = null;
        chunks = [];
        if (!blob.size) {
          handlers.onError?.("No audio captured.");
          handlers.onEnd?.();
          return;
        }
        handlers.onPartial?.("Transcribing…");
        const ext = type.includes("mp4") ? "m4a" : "webm";
        void transcribeRawOpenAIAudio(blob, `dictation.${ext}`)
          .then((text) => {
            if (text) handlers.onFinal?.(text);
            else handlers.onError?.("No speech detected.");
          })
          .catch((e) => {
            handlers.onError?.(
              e instanceof Error ? e.message : "Transcription failed.",
            );
          })
          .finally(() => {
            handlers.onEnd?.();
          });
      };
      try {
        recorder.stop();
      } catch {
        handlers.onEnd?.();
      }
    },
  };
}
