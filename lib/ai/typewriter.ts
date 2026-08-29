/** Reveal finished assistant text word-by-word (UI streaming look). */

export function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Calls `onUpdate` with growing prefixes of `full`.
 * Returns a cancel function.
 */
export function typewriterReveal(
  full: string,
  onUpdate: (partial: string, done: boolean) => void,
  opts?: { msPerWord?: number },
): () => void {
  if (!full || prefersReducedMotion()) {
    onUpdate(full, true);
    return () => {};
  }

  const words = full.split(/(\s+)/);
  let index = 0;
  let cancelled = false;
  const ms = opts?.msPerWord ?? 28;

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
      timer = window.setTimeout(tick, ms);
    }
  };

  let timer = window.setTimeout(tick, ms);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
