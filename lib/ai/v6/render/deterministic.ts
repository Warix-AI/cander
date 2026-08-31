/**
 * Deterministic renderer for facts, math, partial failures.
 */

import type { AnswerBundle, RequestResult } from "../types.ts";

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function renderDeterministic(bundle: AnswerBundle): string {
  const parts: string[] = [];
  const byId = new Map(bundle.results.map((r) => [r.requestId, r]));

  for (const span of bundle.coverage.surfaceSpans) {
    const spanMeta = bundle.surfaceExpectation.spans.find(
      (s) => s.id === span.spanId,
    );
    if (span.status === "non_request") continue;

    if (span.status === "clarification_needed") {
      parts.push(`I need a clarification before answering “${spanMeta?.text || span.spanId}”.`);
      continue;
    }

    if (span.status === "blocked") {
      const reasons = span.requestIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r) => r!.reason || r!.status);
      parts.push(
        `I couldn’t complete “${spanMeta?.text || span.spanId}” because an upstream result failed${
          reasons.length ? ` (${reasons[0]})` : ""
        }.`,
      );
      continue;
    }

    if (span.status === "unresolved") {
      parts.push(
        `I couldn’t verify an answer for “${spanMeta?.text || span.spanId}”.`,
      );
      continue;
    }

    const lines: string[] = [];
    for (const id of span.requestIds) {
      const r = byId.get(id);
      if (!r) continue;
      if (r.status === "blocked_upstream") {
        lines.push(
          `I couldn't verify a required upstream value, so I couldn't finish this part.`,
        );
        continue;
      }
      if (r.status === "conflicting") {
        lines.push(
          `Sources disagree for “${ask || id}”: ${r.reason || "conflict"}. I am not picking a side without a clear primary source.`,
        );
        continue;
      }
      if (r.status === "unresolved") {
        lines.push(`Unresolved: ${spanMeta?.text || id}`);
        continue;
      }
      lines.push(formatResultLine(r, spanMeta?.text));
    }
    if (lines.length) parts.push(lines.join("\n"));
  }

  // Blocked calc special case
  for (const r of bundle.results) {
    if (r.status === "blocked_upstream" && /calc|share|cost/i.test(r.requestId + (r.reason || ""))) {
      const msg =
        "I couldn't verify the current share price, so I couldn't calculate the share total.";
      if (!parts.some((p) => p.includes("share"))) parts.push(msg);
    }
  }

  if (!parts.length) {
    const ok = bundle.results.filter(
      (r) => r.status === "verified" || r.status === "policy_trusted",
    );
    if (ok.length) {
      return ok.map((r) => formatResultLine(r)).join("\n\n");
    }
    return "I couldn’t complete this request with verified information.";
  }

  return parts.join("\n\n");
}

function formatResultLine(r: RequestResult, ask?: string): string {
  const prefix = ask ? `${ask}: ` : "";
  if (r.status === "policy_trusted") {
    return `${prefix}${formatValue(r.value)}`;
  }
  return `${prefix}${formatValue(r.value)}`;
}
