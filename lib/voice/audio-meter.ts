/**
 * Local microphone amplitude metering via Web Audio AnalyserNode.
 * Does not send data to OpenAI — UI only.
 *
 * Amplitude is sampled every animation frame; visual history advances
 * only every VOICE_WAVEFORM_STEP_MS (~3x slower scroll than per-frame).
 */

export const VOICE_WAVEFORM_STEP_MS = 100;

export type AudioMeter = {
  /** Latest smoothed RMS 0..1 (updates every frame) */
  getLevel: () => number;
  /** Rolling history (oldest → newest), values 0..1 — advances every STEP_MS */
  getHistory: () => Float32Array;
  /** Stop AudioContext + disconnect nodes */
  stop: () => void;
};

const HISTORY_LEN = 72;
const SMOOTH = 0.7;

function rmsFromTimeDomain(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = ((data[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(data.length, 1));
}

/**
 * Attach AnalyserNode to an existing MediaStream.
 */
export function createAudioMeter(
  stream: MediaStream,
  opts?: {
    historyLen?: number;
    stepMs?: number;
    onFrame?: (level: number) => void;
  },
): AudioMeter {
  const historyLen = opts?.historyLen ?? HISTORY_LEN;
  const stepMs = opts?.stepMs ?? VOICE_WAVEFORM_STEP_MS;
  const history = new Float32Array(historyLen);
  let write = 0;
  let filled = 0;
  let smoothed = 0;
  let stopped = false;
  let lastCommit = 0;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    return {
      getLevel: () => 0,
      getHistory: () => history,
      stop: () => {},
    };
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.4;
  source.connect(analyser);

  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;

  const tick = (now: number) => {
    if (stopped) return;
    analyser.getByteTimeDomainData(buf);
    const raw = rmsFromTimeDomain(buf);
    // Soft-gate noise floor, then clamp
    const gated = Math.max(0, (raw - 0.02) / 0.35);
    const clamped = Math.min(1, gated);
    smoothed = smoothed * SMOOTH + clamped * (1 - SMOOTH);

    // Always refresh the rightmost committed sample so loudness reacts immediately
    // without advancing the scroll every frame.
    if (filled > 0) {
      const lastIdx = (write - 1 + historyLen) % historyLen;
      history[lastIdx] = smoothed;
    }

    if (!lastCommit || now - lastCommit >= stepMs) {
      history[write] = smoothed;
      write = (write + 1) % historyLen;
      if (filled < historyLen) filled += 1;
      lastCommit = now;
    }

    opts?.onFrame?.(smoothed);
    raf = requestAnimationFrame(tick);
  };

  void ctx.resume().catch(() => {});
  raf = requestAnimationFrame(tick);

  return {
    getLevel: () => smoothed,
    getHistory: () => {
      const out = new Float32Array(filled || historyLen);
      if (filled < historyLen) {
        for (let i = 0; i < filled; i++) out[i] = history[i] ?? 0;
        return out;
      }
      for (let i = 0; i < historyLen; i++) {
        out[i] = history[(write + i) % historyLen] ?? 0;
      }
      return out;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => {});
    },
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
