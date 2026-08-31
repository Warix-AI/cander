/**
 * First-class evidence objects for the local turn orchestrator.
 * Mirror server TurnState.evidence where practical.
 */

import {
  answerShapeFromContract,
  buildSynthesisInstruction,
  compressEvidenceForSynthesis,
  inferResponseContract,
  type CompactEvidenceItem,
} from "../answer-shape/index.ts";

export type EvidenceKind =
  | "web_page"
  | "browser"
  | "search_result"
  | "exa_synthesis"
  | "file"
  | "memory"
  | "knowledge"
  | "tool";

export type TurnEvidence = {
  id: string;
  kind: EvidenceKind;
  title: string;
  url?: string | null;
  content: string;
  retrievedAt: string;
  sourceTool: string;
  ok: boolean;
  error?: string;
  sessionId?: string;
  groundingConfidence?: "low" | "medium" | "high" | "none";
};

let evidenceSeq = 0;

export function newEvidenceId(prefix: string): string {
  evidenceSeq += 1;
  return `${prefix}_${evidenceSeq}`;
}

/** Legacy dump formatter — prefer formatCompressedEvidenceForPrompt for synthesis. */
export function formatEvidenceForPrompt(items: TurnEvidence[]): string {
  if (!items.length) return "";
  const lines = ["## Evidence collected this turn", ""];
  for (const e of items) {
    if (!e.ok) {
      lines.push(
        `[${e.id}] ${e.kind} via ${e.sourceTool} — FAILED: ${e.error ?? "unknown error"}`,
      );
      continue;
    }
    const header = e.url
      ? `[${e.id}] ${e.kind}: ${e.title} (${e.url})`
      : `[${e.id}] ${e.kind}: ${e.title}`;
    lines.push(header, e.content.slice(0, 1200), "");
  }
  return lines.join("\n").trim();
}

/**
 * Compress + shape evidence for FM synthesis. Never injects raw Exa dumps.
 */
export function prepareSynthesisEvidence(
  question: string,
  items: TurnEvidence[],
  profile: "onDevice" | "cloud" = "onDevice",
): { instruction: string; compact: CompactEvidenceItem[]; shapeKind: string } {
  const contract = inferResponseContract(question);
  const shape = answerShapeFromContract(question, contract);

  const direct = items.find(
    (e) => e.ok && e.kind === "exa_synthesis" && e.content.trim().length >= 8,
  );
  if (direct) {
    const instruction = [
      "## CURRENT REQUEST",
      question.trim(),
      "",
      "## GROUNDED RETRIEVAL ANSWER",
      direct.content.trim(),
      "",
      "## RESPONSE CONTRACT",
      "Answer concisely and naturally in the user's language.",
      "Do not modify factual values from the grounded retrieval answer.",
      "Do not substitute dates, opponents, locations, or other facts from lower-ranked snippets.",
    ].join("\n");
    return {
      instruction,
      compact: [
        {
          id: direct.id,
          title: direct.title,
          url: direct.url,
          content: direct.content,
          kind: direct.kind,
          ok: true,
        },
      ],
      shapeKind: shape.kind,
    };
  }

  const webby = items.filter(
    (e) =>
      e.ok &&
      (e.kind === "web_page" ||
        e.kind === "search_result" ||
        e.kind === "knowledge" ||
        e.kind === "browser"),
  );
  const other = items.filter(
    (e) => e.ok && !webby.includes(e) && e.content.trim(),
  );

  const compact = compressEvidenceForSynthesis({
    question,
    shape,
    profile,
    items: [
      ...webby.map((e) => ({
        id: e.id,
        title: e.title,
        url: e.url,
        content: e.content,
        kind: e.kind,
        ok: e.ok,
      })),
      // Keep a thin slice of non-web tool evidence if present
      ...other.slice(0, 2).map((e) => ({
        id: e.id,
        title: e.title,
        url: e.url,
        content: e.content.slice(0, 600),
        kind: e.kind,
        ok: e.ok,
      })),
    ],
  });

  return {
    instruction: buildSynthesisInstruction({
      question,
      shape,
      evidence: compact,
    }),
    compact,
    shapeKind: shape.kind,
  };
}

export function evidenceFromWebSearch(
  toolName: string,
  results: Array<{ title: string; url: string; description: string }>,
): TurnEvidence[] {
  return results.map((r) => ({
    id: newEvidenceId("search"),
    kind: "search_result" as const,
    title: r.title,
    url: r.url,
    content: r.description,
    retrievedAt: new Date().toISOString(),
    sourceTool: toolName,
    ok: true,
  }));
}

export function evidenceFromWebOpen(opts: {
  ok: boolean;
  url: string;
  finalUrl?: string;
  title?: string;
  text?: string;
  error?: string;
}): TurnEvidence {
  return {
    id: newEvidenceId("page"),
    kind: "web_page",
    title: opts.title || opts.url,
    url: opts.finalUrl || opts.url,
    content: opts.text?.slice(0, 12_000) ?? "",
    retrievedAt: new Date().toISOString(),
    sourceTool: "web.open",
    ok: opts.ok && Boolean(opts.text?.trim()),
    error: opts.error,
  };
}

export function evidenceFromBrowserObservation(opts: {
  ok: boolean;
  sourceTool: string;
  url?: string;
  title?: string;
  snapshot?: string;
  sessionId?: string;
  error?: string;
}): TurnEvidence {
  return {
    id: newEvidenceId("browser"),
    kind: "browser",
    title: opts.title || opts.url || "Remote browser",
    url: opts.url ?? null,
    content: opts.snapshot?.slice(0, 12_000) ?? "",
    retrievedAt: new Date().toISOString(),
    sourceTool: opts.sourceTool,
    ok: opts.ok && Boolean(opts.snapshot?.trim()),
    error: opts.error,
    sessionId: opts.sessionId,
  };
}
