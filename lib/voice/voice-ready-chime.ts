/**
 * Short ready chime when Live voice connects (~1s).
 */

/** Soft ascending triad — subtle “you’re live” cue, not a spoken greeting. */
export function playVoiceReadyChime(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes: Array<{ f: number; t: number; d: number; g: number }> = [
      { f: 587.33, t: 0, d: 0.42, g: 0.07 }, // D5
      { f: 739.99, t: 0.16, d: 0.5, g: 0.065 }, // F#5
      { f: 880.0, t: 0.34, d: 0.62, g: 0.055 }, // A5
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.f, now + n.t);
      gain.gain.setValueAtTime(0.0001, now + n.t);
      gain.gain.exponentialRampToValueAtTime(n.g, now + n.t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.02);
    }
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1100);
  } catch {
    /* ignore */
  }
}
