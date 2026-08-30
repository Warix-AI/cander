/** Presentation-layer reveal of finished assistant text.

Does not slow model or tool execution — only UI pacing of already-ready text.
 */

export function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type StreamBufferOptions = {
  /** Base ms between visible word releases (default ~42 — calmer than raw dump). */
  msPerWord?: number;
  /** After this many chars remain, speed up so long replies finish promptly. */
  catchUpRemainingChars?: number;
  /** Floor ms when catching up. */
  catchUpMsPerWord?: number;
};

/**
 * Calls `onUpdate` with growing prefixes of `full`.
 * Returns a cancel function.
 *
 * Cadence is intentionally a bit slower than instantaneous paint, then
 * accelerates near the end so long answers don't crawl.
 */
export function typewriterReveal(
  full: string,
  onUpdate: (partial: string, done: boolean) => void,
  opts?: StreamBufferOptions,
): () => void {
  if (!full || prefersReducedMotion()) {
    onUpdate(full, true);
    return () => {};
  }

  const words = full.split(/(\s+)/);
  let index = 0;
  let cancelled = false;
  const baseMs = opts?.msPerWord ?? 42;
  const catchUpAt = opts?.catchUpRemainingChars ?? 480;
  const catchUpMs = opts?.catchUpMsPerWord ?? 16;

  const delayFor = () => {
    const remaining = words.slice(index).join("").length;
    if (remaining <= catchUpAt) return catchUpMs;
    // Mild ease: slightly faster as we progress through the buffer.
    const progress = index / Math.max(1, words.length);
    return Math.max(catchUpMs, Math.round(baseMs * (1 - progress * 0.35)));
  };

  const tick = () => {
    if (cancelled) return;
    index += 1;
    // Advance by word tokens (including whitespace captures).
    while (index < words.length && !words[index - 1]?.trim() && index < words.length) {
      index += 1;
    }
    const partial = words.slice(0, Math.min(index, words.length)).join("");
    const done = index >= words.length;
    onUpdate(partial, done);
    if (!done) {
      timer = window.setTimeout(tick, delayFor());
    }
  };

  let timer = window.setTimeout(tick, delayFor());
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

/**
 * Push-based stream buffer: model/tool chunks enter immediately; UI drains
 * at a controlled cadence. Call `push` with new full text (or deltas merged
 * by the caller) and `finish` when generation is done (drains faster).
 */
export function createStreamPresentationBuffer(opts?: {
  msPerTick?: number;
  charsPerTick?: number;
  catchUpCharsPerTick?: number;
  onVisible: (text: string, done: boolean) => void;
}): {
  push: (fullSoFar: string) => void;
  finish: (finalText: string) => void;
  cancel: () => void;
} {
  let target = "";
  let visible = "";
  let finished = false;
  let cancelled = false;
  let timer: number | null = null;
  const ms = opts?.msPerTick ?? 32;
  const slowChars = opts?.charsPerTick ?? 3;
  const fastChars = opts?.catchUpCharsPerTick ?? 24;

  const drain = () => {
    if (cancelled) return;
    if (visible.length >= target.length) {
      if (finished) {
        opts?.onVisible(target, true);
        timer = null;
        return;
      }
      timer = null;
      return;
    }
    const step = finished ? fastChars : slowChars;
    visible = target.slice(0, Math.min(target.length, visible.length + step));
    opts?.onVisible(visible, finished && visible.length >= target.length);
    timer = window.setTimeout(drain, finished ? Math.max(12, ms / 2) : ms);
  };

  const ensureTimer = () => {
    if (cancelled || timer != null) return;
    if (typeof window === "undefined" || prefersReducedMotion()) {
      visible = target;
      opts?.onVisible(visible, finished);
      return;
    }
    timer = window.setTimeout(drain, ms);
  };

  return {
    push(fullSoFar: string) {
      if (cancelled) return;
      target = fullSoFar;
      ensureTimer();
    },
    finish(finalText: string) {
      if (cancelled) return;
      finished = true;
      target = finalText;
      ensureTimer();
      if (typeof window === "undefined" || prefersReducedMotion()) {
        opts?.onVisible(target, true);
      }
    },
    cancel() {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      timer = null;
    },
  };
}
