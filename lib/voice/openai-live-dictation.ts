/**
 * OpenAI Realtime live dictation — stream PCM while recording, paste on stop.
 * Mic + local queue start immediately; token/WS connect in parallel so the
 * first seconds of speech aren’t lost. Falls back to batch upload if needed.
 */

import {
  getRawOpenAIAuthHeaders,
  transcribeRawOpenAIAudio,
} from "../ai/raw-openai/upload-client.ts";
import {
  createAudioMeter,
  logDictationTiming,
  type AudioMeter,
} from "./audio-meter.ts";
import {
  isOpenAIDictationSupported,
  pickDictationMime,
  startBatchVoiceDictation,
  type DictationMime,
  type StartVoiceDictationHandlers,
  type VoiceDictationSession,
} from "./openai-dictation.ts";

const TARGET_RATE = 24_000;
const WS_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
const MIN_COMMIT_MS = 100;
/** Cap queued pre-connect audio (~45s at 24kHz mono pcm16 ≈ heavy; keep ~12s). */
const MAX_PENDING_CHUNKS = 400;

export { isOpenAIDictationSupported, pickDictationMime };
export type { DictationMime, VoiceDictationSession, StartVoiceDictationHandlers };

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function downsample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input;
  if (inputRate <= 0 || outputRate <= 0) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j]!;
      count++;
    }
    output[i] = count ? sum / count : (input[start] ?? 0);
  }
  return output;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchRealtimeClientSecret(): Promise<string> {
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sign in to use voice dictation.");
  }
  const response = await fetch("/api/ai/raw-openai/realtime-token", {
    method: "POST",
    headers: {
      ...headers,
      "Idempotency-Key": `rt-dictation:${Date.now()}`,
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    clientSecret?: string;
    error?: string;
  };
  if (!response.ok || !data.clientSecret) {
    throw new Error(data.error || "Could not start live transcription.");
  }
  return data.clientSecret;
}

function openRealtimeSocket(clientSecret: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL, [
        "realtime",
        `openai-insecure-api-key.${clientSecret}`,
      ]);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("WebSocket failed."));
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("Live transcription connection timed out."));
    }, 12_000);

    ws.addEventListener("open", () => {
      window.clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("Live transcription connection failed."));
    });
  });
}

function isBufferTooSmallError(message: string): boolean {
  return /buffer too small|only has 0\.00ms/i.test(message);
}

async function startRealtimeVoiceDictation(
  handlers?: StartVoiceDictationHandlers,
): Promise<VoiceDictationSession> {
  const t0 = handlers?.t0 ?? performance.now();
  const mime: DictationMime = { mimeType: "audio/pcm", extension: "pcm" };

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("Web Audio isn’t available for live dictation.");
  }

  // 1) Bind gesture + open mic FIRST — capture begins before any network wait.
  const audioCtx = new AudioCtx();
  void audioCtx.resume().catch(() => undefined);

  logDictationTiming("getUserMedia_started", t0);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    void audioCtx.close().catch(() => undefined);
    throw new Error("Microphone permission is required for voice dictation.");
  }
  logDictationTiming("getUserMedia_resolved", t0);
  void audioCtx.resume().catch(() => undefined);

  const meter = createAudioMeter(stream);
  const batchMime = pickDictationMime();
  const batchChunks: BlobPart[] = [];
  let batchRecorder: MediaRecorder | null = null;
  try {
    batchRecorder = batchMime.mimeType
      ? new MediaRecorder(stream, { mimeType: batchMime.mimeType })
      : new MediaRecorder(stream);
    batchRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) batchChunks.push(ev.data);
    };
    batchRecorder.start(200);
  } catch {
    batchRecorder = null;
  }

  let closed = false;
  let ws: WebSocket | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let dest: MediaStreamAudioDestinationNode | null = null;

  let deltaTranscript = "";
  let completedTranscript = "";
  let canSend = false;
  let appendedMs = 0;
  const pendingAudio: string[] = [];
  let resolveDone: ((text: string) => void) | null = null;
  let rejectDone: ((err: Error) => void) | null = null;
  let connectError: Error | null = null;

  const flushPending = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    canSend = true;
    for (const audio of pendingAudio) {
      try {
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio,
          }),
        );
      } catch {
        /* ignore */
      }
    }
    pendingAudio.length = 0;
  };

  const enqueueAudio = (base64: string, frameMs: number) => {
    if (closed) return;
    appendedMs += frameMs;
    // Always keep early speech — queue until the socket can accept it.
    if (!ws || ws.readyState !== WebSocket.OPEN || !canSend) {
      pendingAudio.push(base64);
      while (pendingAudio.length > MAX_PENDING_CHUNKS) {
        pendingAudio.shift();
      }
      return;
    }
    try {
      ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64,
        }),
      );
    } catch {
      pendingAudio.push(base64);
    }
  };

  // Start PCM capture immediately (queues until WS is ready).
  source = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  dest = audioCtx.createMediaStreamDestination();
  source.connect(processor);
  processor.connect(dest);

  processor.onaudioprocess = (ev) => {
    if (closed) return;
    const input = ev.inputBuffer.getChannelData(0);
    const inputRate = audioCtx.sampleRate || TARGET_RATE;
    const resampled = downsample(input, inputRate, TARGET_RATE);
    if (!resampled.length) return;
    const frameMs = (resampled.length / TARGET_RATE) * 1000;
    enqueueAudio(bufferToBase64(floatTo16BitPCM(resampled)), frameMs);
  };

  handlers?.onReady?.(mime);
  logDictationTiming("pcm_capture_started", t0);

  const attachSocketHandlers = (socket: WebSocket) => {
    socket.addEventListener("message", (event) => {
      let payload: {
        type?: string;
        delta?: string;
        transcript?: string;
        error?: { message?: string };
      };
      try {
        payload = JSON.parse(String(event.data)) as typeof payload;
      } catch {
        return;
      }

      if (payload.type === "error") {
        const message = payload.error?.message || "Live transcription error.";
        if (isBufferTooSmallError(message)) {
          if (resolveDone) {
            resolveDone("");
            resolveDone = null;
            rejectDone = null;
          }
          return;
        }
        handlers?.onError?.(message);
        if (rejectDone) {
          rejectDone(new Error(message));
          resolveDone = null;
          rejectDone = null;
        }
        return;
      }

      if (
        payload.type === "session.created" ||
        payload.type === "session.updated"
      ) {
        flushPending();
        return;
      }

      if (
        payload.type === "conversation.item.input_audio_transcription.delta" &&
        typeof payload.delta === "string"
      ) {
        deltaTranscript += payload.delta;
        return;
      }

      if (
        payload.type ===
          "conversation.item.input_audio_transcription.completed" &&
        typeof payload.transcript === "string"
      ) {
        completedTranscript = payload.transcript.trim();
        if (resolveDone) {
          resolveDone(completedTranscript || deltaTranscript.trim());
          resolveDone = null;
          rejectDone = null;
        }
      }
    });
  };

  // 2) Network connect in parallel — early speech stays in pendingAudio.
  const socketReady = (async () => {
    logDictationTiming("realtime_token_started", t0);
    const clientSecret = await fetchRealtimeClientSecret();
    logDictationTiming("realtime_token_ready", t0);
    const socket = await openRealtimeSocket(clientSecret);
    if (closed) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      return null;
    }
    ws = socket;
    attachSocketHandlers(socket);
    logDictationTiming("realtime_ws_open", t0);

    socket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "transcription",
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: TARGET_RATE,
              },
              transcription: {
                model: "gpt-live-transcribe",
                // Lower delay so early buffered audio starts producing text sooner.
                delay: "low",
              },
              turn_detection: null,
            },
          },
        },
      }),
    );

    // Don't wait long — flush as soon as the socket is up.
    flushPending();
    window.setTimeout(() => {
      if (!closed) flushPending();
    }, 150);

    return socket;
  })().catch((err) => {
    connectError =
      err instanceof Error ? err : new Error("Live transcription failed.");
    console.warn("[dictation] realtime connect failed", connectError.message);
    return null;
  });

  const stopBatchRecorder = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const rec = batchRecorder;
      batchRecorder = null;
      if (!rec || rec.state === "inactive") {
        const type = batchMime.mimeType || "audio/webm";
        resolve(batchChunks.length ? new Blob(batchChunks, { type }) : null);
        return;
      }
      rec.onstop = () => {
        const type = rec.mimeType || batchMime.mimeType || "audio/webm";
        resolve(batchChunks.length ? new Blob(batchChunks, { type }) : null);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });

  const releaseHardware = () => {
    try {
      processor?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      dest?.disconnect();
    } catch {
      /* ignore */
    }
    processor = null;
    source = null;
    dest = null;
    void audioCtx.close().catch(() => undefined);
    meter.stop();
    stream.getTracks().forEach((t) => t.stop());
  };

  const waitForFinal = (timeoutMs: number): Promise<string> =>
    new Promise((resolve, reject) => {
      if (completedTranscript.trim()) {
        resolve(completedTranscript.trim());
        return;
      }

      const timer = window.setTimeout(() => {
        resolveDone = null;
        rejectDone = null;
        const fallback = (completedTranscript || deltaTranscript).trim();
        if (fallback) resolve(fallback);
        else reject(new Error("No speech detected."));
      }, timeoutMs);

      resolveDone = (text) => {
        window.clearTimeout(timer);
        resolveDone = null;
        rejectDone = null;
        resolve((text || deltaTranscript).trim());
      };
      rejectDone = (err) => {
        window.clearTimeout(timer);
        resolveDone = null;
        rejectDone = null;
        const fallback = (completedTranscript || deltaTranscript).trim();
        if (fallback) resolve(fallback);
        else reject(err);
      };
    });

  return {
    getMeter: () => meter,
    getMime: () => mime,
    cancel: () => {
      if (closed) return;
      closed = true;
      resolveDone = null;
      rejectDone = null;
      try {
        batchRecorder?.stop();
      } catch {
        /* ignore */
      }
      batchRecorder = null;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      releaseHardware();
    },
    stopAndTranscribe: async () => {
      if (closed) throw new Error("Recording already ended.");
      closed = true;

      try {
        processor?.disconnect();
      } catch {
        /* ignore */
      }
      processor = null;

      // Finish connect if it's still in flight (so queued audio can flush).
      const socket = await socketReady;
      let liveText = "";

      if (socket && socket.readyState === WebSocket.OPEN) {
        flushPending();
        if (appendedMs >= MIN_COMMIT_MS) {
          try {
            socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          } catch {
            /* ignore */
          }
          try {
            liveText = (await waitForFinal(2200)).trim();
          } catch {
            liveText = "";
          }
        }
      } else if (connectError) {
        // Realtime never connected — batch path below.
      }

      const batchBlob = await stopBatchRecorder();

      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      releaseHardware();

      if (liveText) return liveText;

      if (!batchBlob || batchBlob.size < 64) {
        throw new Error("No speech detected.");
      }
      const filename = `dictation.${batchMime.extension || "webm"}`;
      const text = await transcribeRawOpenAIAudio(batchBlob, filename);
      if (!text.trim()) throw new Error("No speech detected.");
      return text.trim();
    },
  };
}

/**
 * Prefer OpenAI realtime streaming; fall back to batch MediaRecorder upload.
 */
export async function startVoiceDictation(
  handlers?: StartVoiceDictationHandlers,
): Promise<VoiceDictationSession> {
  if (!isOpenAIDictationSupported()) {
    throw new Error("Recording isn’t supported in this browser.");
  }

  try {
    return await startRealtimeVoiceDictation(handlers);
  } catch (err) {
    console.warn(
      "[dictation] realtime unavailable, falling back to batch",
      err instanceof Error ? err.message : err,
    );
    return startBatchVoiceDictation(handlers);
  }
}

/** @deprecated Prefer startVoiceDictation */
export { startVoiceDictation as startOpenAIDictation };
