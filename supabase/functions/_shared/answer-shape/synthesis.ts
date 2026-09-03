/**
 * Synthesis instructions — shared by local FM and Edge answer prompts.
 */

import type { AnswerShape, CompactEvidenceItem } from "./types.ts";

export const SEARCH_SYNTHESIS_RULES = `Answer the user's question directly.

Search results are supporting evidence, not something to summarize.

Lead with the actual answer.

Use only as much detail as necessary.

Choose formatting based on the content:
- bullets for small lists and multi-component totals
- tables for useful comparisons
- short paragraphs for explanations
- headings only when the response is complex enough to need them

For multi-part factual totals (components that sum to an answer):
1. Lead with the combined total in one short line
2. Then a bullet breakdown of each component with its value
3. End with a bold Total line
Example shape (adapt labels/units to the question — never invent a domain template):
About 1,070 calories total:

• Half fried rice: 310 cal
• Half chow mein: 300 cal
• Orange chicken: 510 cal

**Total: ~1,120 calories**

Resolve each component from evidence separately, then add deterministically. If sources conflict, investigate further or state the conflict briefly — do not ask the user to check a menu or website when retrieval is available.

Calculate or combine information when the user's question requires it.

Do not expose raw search results, tool output, retrieval metadata, or internal errors.

Do not paste long URLs or search snippets into the answer.

Do not say things like "here's what the search returned," "according to my search," or "based on the results above."

If information is uncertain or conflicting, say so briefly.

Sources are shown separately in the UI — do not append a Sources section unless the user explicitly asked for citations in the text.

When structured blocks clearly help (process, hierarchy, decision matrix, ranking, pros/cons, FAQ, comparison cards), you may return JSON {"version":2,"blocks":[...]} using those block types. Prefer plain prose or markdown for simple answers. Never invent Mermaid or ASCII diagrams.`;

export function formatCompactEvidenceBlock(
  items: CompactEvidenceItem[],
): string {
  if (!items.length) return "";
  const lines = [
    "## Compact evidence (use as support only — do not dump or narrate as a search report)",
    "",
  ];
  for (const e of items) {
    const where = e.domain || e.url || "";
    lines.push(`[${e.id}] ${e.title}${where ? ` — ${where}` : ""}`);
    lines.push(e.excerpt);
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function buildSynthesisInstruction(opts: {
  question: string;
  shape: AnswerShape;
  evidence: CompactEvidenceItem[];
}): string {
  const evidenceBlock = formatCompactEvidenceBlock(opts.evidence);
  const parts = [
    "## Answer shaping for this turn",
    `Inferred response kind: ${opts.shape.kind}`,
    opts.shape.formatHint,
    `Soft length target: about ${opts.shape.maxSentences} sentences (or equivalent bullets). Default to the shortest complete answer that fully satisfies the request.`,
    opts.shape.preferTable
      ? "A small markdown table is appropriate if it clarifies the comparison."
      : null,
    opts.shape.preferBullets
      ? "Prefer bullets over long paragraphs when listing discrete facts."
      : null,
    opts.shape.allowHeadings
      ? "Headings are allowed only if the answer needs clear sections."
      : "Do not use headings for this answer.",
    "If the user asked for N items (bullets, ideas, examples), include all N complete items before stopping.",
    "",
    SEARCH_SYNTHESIS_RULES,
    "",
    evidenceBlock ||
      "## Compact evidence\n(none — answer only if you can without inventing live facts; otherwise say you could not retrieve reliable information.)",
  ];
  return parts.filter((p) => p !== null).join("\n");
}

/**
 * Deterministic structured fallback when the model cannot synthesize
 * (context overflow / empty generation / hedge-despite-evidence).
 * Narrow use only — not a second general answer engine.
 * Prefer FM synthesis whenever it produces a grounded reply.
 */
export function deterministicAnswerFromEvidence(opts: {
  question: string;
  shape: AnswerShape;
  evidence: CompactEvidenceItem[];
}): string {
  const items = opts.evidence;
  if (!items.length) {
    return "I couldn’t retrieve reliable information for that right now. Please try again in a moment.";
  }

  if (opts.shape.kind === "comparison" && items.length >= 2) {
    const rows = items.slice(0, 4).map((e) => {
      const claim = e.excerpt.split(/(?<=[.!?])\s+/)[0] ?? e.excerpt;
      return `| ${e.title.slice(0, 40)} | ${claim.slice(0, 120)} |`;
    });
    return [
      "Here’s a concise comparison from the strongest sources:",
      "",
      "| Source | Key point |",
      "| --- | --- |",
      ...rows,
    ].join("\n");
  }

  if (opts.shape.preferBullets || opts.shape.kind === "list") {
    const bullets = items.slice(0, 5).map((e) => {
      const claim = e.excerpt.split(/(?<=[.!?])\s+/)[0] ?? e.excerpt;
      return `- **${e.title.slice(0, 60)}:** ${claim.slice(0, 160)}`;
    });
    return ["Here’s the key information:", "", ...bullets].join("\n");
  }

  // Fact / explanation / calculation default: lead with strongest excerpt
  const top = items[0]!;
  const lead =
    top.excerpt.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") || top.excerpt;
  const extra =
    items.length > 1
      ? `\n\nAlso noted: ${(items[1]!.excerpt.split(/(?<=[.!?])\s+/)[0] ?? "").slice(0, 140)}`
      : "";
  return `${lead.slice(0, 320)}${extra}`.trim();
}

export function looksLikeContextOverflow(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /context (length|window)|too long|token limit|maximum context|prompt is too long|exceeds? (the )?context|context_length|max_tokens|input too large/i.test(
      m,
    ) || /nsurlerror|string too long|prompt.*limit/i.test(m)
  );
}
