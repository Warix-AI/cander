/**
 * Progressive content emission during local turns (v4 §7 Phase 3).
 */

import type { AgentTurnProgress } from "../agent-turn.ts";

export function emitContentDelta(
  report: (progress: AgentTurnProgress) => void,
  contentDelta: string,
  done = false,
): void {
  if (!contentDelta.trim()) return;
  report({
    phase: "generating",
    label: "Thinking",
    detail: done ? "Done" : "Generating",
    contentDelta,
    contentStreaming: !done,
  });
}

/** Simulated word-chunk streaming for deterministic answers (client only). */
export async function streamContentViaProgress(
  report: (progress: AgentTurnProgress) => void,
  full: string,
): Promise<void> {
  if (!full.trim()) return;
  if (typeof window === "undefined") {
    emitContentDelta(report, full, true);
    return;
  }
  const words = full.split(/(\s+)/);
  let partial = "";
  for (let i = 0; i < words.length; i += 1) {
    partial += words[i] ?? "";
    emitContentDelta(report, partial, false);
    await new Promise((r) => setTimeout(r, 18));
  }
  emitContentDelta(report, full, true);
}
