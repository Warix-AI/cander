/**
 * Local microphone amplitude metering via Web Audio AnalyserNode.
 * Does not send data to OpenAI — UI only.
 */

export type AudioMeter = {
  /** Latest smoothed RMS 0..1 */
  getLevel: () => number;
  /** Rolling history (oldest → newest), values 0..1 */
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
 * Call startLoop from the consumer (rAF) via pull getters, or use the
 * optional onFrame callback when provided.
 */
export function createAudioMeter(
  stream: MediaStream,
  opts?: { historyLen?: number; onFrame?: (level: number) => void },
): AudioMeter {
  const historyLen = opts?.historyLen ?? HISTORY_LEN;
  const history = new Float32Array(historyLen);
  let write = 0;
  let filled = 0;
  let smoothed = 0;
  let stopped = false;

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

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(buf);
    const raw = rmsFromTimeDomain(buf);
    // Soft-gate noise floor, then clamp
    const gated = Math.max(0, (raw - 0.02) / 0.35);
    const clamped = Math.min(1, gated);
    smoothed = smoothed * SMOOTH + clamped * (1 - SMOOTH);

    history[write] = smoothed;
    write = (write + 1) % historyLen;
    if (filled < historyLen) filled += 1;

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
