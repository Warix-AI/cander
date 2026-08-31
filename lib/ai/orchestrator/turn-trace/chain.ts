/**
 * Build retrieval-to-answer chain for diff/debug view.
 */

import type { RetrievalChainLink, TurnTrace } from "./types.ts";

export type RetrievalChainView = {
  traceId: string;
  links: RetrievalChainLink[];
  /** Side-by-side hints when model output diverges from accepted evidence. */
  divergenceHints: string[];
};

function extractFactSnippets(text: string): string[] {
  const parts = text
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  return parts.slice(0, 12);
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const w of ta) {
    if (tb.has(w)) hits++;
  }
  return hits / Math.max(ta.size, tb.size);
}

export function buildRetrievalChainView(trace: TurnTrace): RetrievalChainView {
  const hints: string[] = [];
  const accepted = trace.retrievalChain.filter((l) => l.step === "accepted_evidence");
  const modelOut = trace.retrievalChain.find((l) => l.step === "model_output");
  const final = trace.retrievalChain.find((l) => l.step === "final_answer");

  if (accepted.length && modelOut) {
    const evidenceText = accepted
      .map((l) => {
        const p = l.payload as { content?: string; title?: string };
        return `${p.title ?? ""} ${p.content ?? ""}`.trim();
      })
      .join(" ");
    const modelText =
      typeof modelOut.payload === "string"
        ? modelOut.payload
        : String((modelOut.payload as { text?: string })?.text ?? "");
    const evidenceFacts = extractFactSnippets(evidenceText);
    const modelFacts = extractFactSnippets(modelText);
    for (const mf of modelFacts) {
      const best = Math.max(...evidenceFacts.map((ef) => overlapScore(mf, ef)), 0);
      if (best < 0.25 && mf.length > 20) {
        hints.push(`Model stated "${mf.slice(0, 100)}" — weak overlap with accepted evidence.`);
      }
    }
  }

  if (modelOut && final) {
    const modelText =
      typeof modelOut.payload === "string"
        ? modelOut.payload
        : String((modelOut.payload as { text?: string })?.text ?? "");
    const finalText =
      typeof final.payload === "string"
        ? final.payload
        : String(final.payload ?? "");
    if (modelText.trim() && finalText.trim() && modelText.trim() !== finalText.trim()) {
      hints.push("Final rendered answer differs from raw model output (sanitization/streaming).");
    }
  }

  return {
    traceId: trace.traceId,
    links: trace.retrievalChain,
    divergenceHints: hints,
  };
}

export function filterTraceEvents(
  trace: TurnTrace,
  filters: {
    stage?: string;
    taskId?: string;
    failureType?: string;
  },
): TurnTrace["events"] {
  return trace.events.filter((e) => {
    if (filters.stage && e.stage !== filters.stage) return false;
    if (filters.taskId && e.taskId !== filters.taskId) return false;
    if (filters.failureType && e.failureType !== filters.failureType) return false;
    return true;
  });
}
