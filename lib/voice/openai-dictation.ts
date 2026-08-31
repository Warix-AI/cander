/**
 * OpenAI dictation recorder — MediaRecorder + shared mic stream for metering.
 * Cancel discards audio (no API). Stop uploads to Cander → OpenAI transcription.
 */

import {
  createAudioMeter,
  logDictationTiming,
  type AudioMeter,
} from "./audio-meter.ts";
import { transcribeRawOpenAIAudio } from "../ai/raw-openai/upload-client.ts";

export type DictationMime = {
  mimeType: string;
  extension: string;
};

export function pickDictationMime(): DictationMime {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "", extension: "webm" };
  }
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/aac", extension: "aac" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", extension: "webm" };
}

export function isOpenAIDictationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

export type VoiceDictationSession = {
  /** Live amplitude meter (Web Audio). Null until stream is ready. */
  getMeter: () => AudioMeter | null;
  /** MIME actually used by MediaRecorder */
  getMime: () => DictationMime;
  /** Stop mic + discard blob — never calls OpenAI */
  cancel: () => void;
  /** Stop mic + MediaRecorder → transcribe via OpenAI */
  stopAndTranscribe: () => Promise<string>;
};

export type StartVoiceDictationHandlers = {
  onReady?: (mime: DictationMime) => void;
  onError?: (message: string) => void;
  /** performance.now() from mic button press for timing logs */
  t0?: number;
};

export async function startVoiceDictation(
  handlers?: StartVoiceDictationHandlers,
): Promise<VoiceDictationSession> {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let meter: AudioMeter | null = null;
  let chunks: BlobPart[] = [];
  let closed = false;
  const mime = pickDictationMime();
  const t0 = handlers?.t0 ?? performance.now();

  logDictationTiming("getUserMedia_started", t0);
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    throw new Error("Microphone permission is required for voice dictation.");
  }
  logDictationTiming("getUserMedia_resolved", t0);

  meter = createAudioMeter(stream);

  try {
    recorder = mime.mimeType
      ? new MediaRecorder(stream, { mimeType: mime.mimeType })
      : new MediaRecorder(stream);
  } catch {
    meter.stop();
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Recording isn’t supported in this browser.");
  }

  chunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };
  recorder.onerror = () => {
    handlers?.onError?.("Microphone recording failed.");
  };
  // Smaller timeslice → first chunk sooner; UI already visible before this.
  recorder.start(100);
  logDictationTiming("MediaRecorder_started", t0);
  handlers?.onReady?.(mime);

  const releaseHardware = () => {
    meter?.stop();
    meter = null;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    recorder = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  const waitForBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const rec = recorder;
      if (!rec || rec.state === "inactive") {
        const type = mime.mimeType || "audio/webm";
        const blob = chunks.length ? new Blob(chunks, { type }) : null;
        resolve(blob);
        return;
      }
      rec.onstop = () => {
        const type = rec.mimeType || mime.mimeType || "audio/webm";
        const blob = chunks.length ? new Blob(chunks, { type }) : null;
        resolve(blob);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });

  return {
    getMeter: () => meter,
    getMime: () => mime,
    cancel: () => {
      if (closed) return;
      closed = true;
      chunks = [];
      releaseHardware();
    },
    stopAndTranscribe: async () => {
      if (closed) throw new Error("Recording already ended.");
      closed = true;
      // Release metering immediately so the UI can settle while MediaRecorder finalizes.
      meter?.stop();
      meter = null;
      const blob = await waitForBlob();
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      recorder = null;

      if (!blob || blob.size < 64) {
        throw new Error("No speech detected.");
      }
      const filename = `dictation.${mime.extension || "webm"}`;
      const text = await transcribeRawOpenAIAudio(blob, filename);
      if (!text.trim()) throw new Error("No speech detected.");
      return text.trim();
    },
  };
}

/** @deprecated Prefer startVoiceDictation — kept for older callers */
export { startVoiceDictation as startOpenAIDictation };
