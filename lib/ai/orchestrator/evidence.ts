/**
 * First-class evidence objects for the local turn orchestrator.
 * Mirror server TurnState.evidence where practical.
 */

export type EvidenceKind =
  | "web_page"
  | "search_result"
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
};

let evidenceSeq = 0;

export function newEvidenceId(prefix: string): string {
  evidenceSeq += 1;
  return `${prefix}_${evidenceSeq}`;
}

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
    lines.push(header, e.content.slice(0, 4000), "");
  }
  return lines.join("\n").trim();
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
