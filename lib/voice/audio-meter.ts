/**
 * Local microphone amplitude metering via Web Audio AnalyserNode.
 * Does not send data to OpenAI — UI only.
 *
 * Mic analysis runs every animation frame; the waveform canvas owns a
 * fixed-length ring buffer and advances it every VOICE_WAVEFORM_STEP_MS.
 */

export const VOICE_WAVEFORM_STEP_MS = 65;

/** Visual bar geometry (CSS px) — ChatGPT-like thin pills. */
export const WAVEFORM_BAR_WIDTH = 2.5;
export const WAVEFORM_GAP = 5;
export const WAVEFORM_MIN_SAMPLES = 35;
export const WAVEFORM_MAX_SAMPLES = 120;
export const WAVEFORM_MIN_HEIGHT = 3;
export const WAVEFORM_MAX_HEIGHT = 36;

const NOISE_FLOOR = 0.018;
const GAIN = 3.2;
const SMOOTH_PREV = 0.55;
const SMOOTH_NEXT = 0.45;

export type AudioMeter = {
  /** Latest smoothed amplitude 0..1 (updates every frame) */
  getLevel: () => number;
  /** Stop AudioContext + disconnect nodes */
  stop: () => void;
};

export function sampleCountForWidth(widthPx: number): number {
  const pitch = WAVEFORM_BAR_WIDTH + WAVEFORM_GAP;
  const n = Math.floor(Math.max(0, widthPx) / pitch);
  return Math.min(
    WAVEFORM_MAX_SAMPLES,
    Math.max(WAVEFORM_MIN_SAMPLES, n || WAVEFORM_MIN_SAMPLES),
  );
}

function rmsFromTimeDomain(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = ((data[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(data.length, 1));
}

function processAmplitude(rawRms: number): number {
  const gated = Math.max(0, rawRms - NOISE_FLOOR);
  if (gated <= 0) return 0;
  const normalized = Math.min(1, gated * GAIN);
  // Nonlinear compression so normal speech shows variation without shouting
  return Math.pow(normalized, 0.6);
}

/**
 * Attach AnalyserNode to an existing MediaStream.
 * Returns live level only — waveform history lives in the canvas component.
 */
export function createAudioMeter(
  stream: MediaStream,
  opts?: {
    onFrame?: (level: number) => void;
  },
): AudioMeter {
  let smoothed = 0;
  let stopped = false;
  let firstAmplitudeLogged = false;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    return {
      getLevel: () => 0,
      stop: () => {},
    };
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.35;
  source.connect(analyser);

  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(buf);
    const visual = processAmplitude(rmsFromTimeDomain(buf));
    smoothed = smoothed * SMOOTH_PREV + visual * SMOOTH_NEXT;

    if (!firstAmplitudeLogged && smoothed > 0.02) {
      firstAmplitudeLogged = true;
      logDictationTiming("first_audio_amplitude");
    }

    opts?.onFrame?.(smoothed);
    raf = requestAnimationFrame(tick);
  };

  void ctx.resume().catch(() => {});
  raf = requestAnimationFrame(tick);

  return {
    getLevel: () => smoothed,
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

/** Dev-only timing breadcrumbs for mic-start latency. */
export function logDictationTiming(event: string, t0?: number): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return;
  }
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const delta = typeof t0 === "number" ? Math.round(now - t0) : undefined;
  console.log(
    "[DICTATION_TIMING]",
    delta !== undefined ? { event, ms: delta } : { event, t: Math.round(now) },
  );
}
