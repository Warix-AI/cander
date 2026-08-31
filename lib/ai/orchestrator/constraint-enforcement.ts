/**
 * Constraint enforcement modes — v4 §3.1.
 * Every constraint must declare how it is honored (or explicitly ADVISORY).
 */

import type { RequestSpan } from "./request-scanner.ts";

export type ConstraintEnforcementMode = "PRE" | "POST" | "BOTH" | "ADVISORY";

export type BoundConstraint = {
  id: string;
  text: string;
  mode: ConstraintEnforcementMode;
  /** Tool/domain hint when mode is PRE or BOTH. */
  domain?: string;
};

const PRE_TEMPORAL =
  /\b(nothing before|nothing after|before\s+\d|after\s+\d|not before|not after)\b/i;
const PRE_PRICE = /\b(under\s*\$?\d+|over\s*\$?\d+|less than\s*\$?\d+)\b/i;
const POST_UI = /\bdon'?t touch\b[\s\S]{0,40}\b(mobile|layout|ui|css|frontend)\b/i;
const POST_EXCLUDE = /\b(no\s+[A-Za-z]|exclude|without|avoid)\b/i;
const ADVISORY_STYLE = /\bkeep it\b[\s\S]{0,30}\b(casual|brief|short|simple)\b/i;

export function inferConstraintMode(text: string): ConstraintEnforcementMode {
  if (ADVISORY_STYLE.test(text)) return "ADVISORY";
  if (PRE_TEMPORAL.test(text) || PRE_PRICE.test(text)) return "PRE";
  if (POST_UI.test(text) || POST_EXCLUDE.test(text)) return "POST";
  if (/\bdon'?t\b|\bdo not\b|\bmust not\b/i.test(text)) return "POST";
  return "ADVISORY";
}

export function bindConstraints(spans: RequestSpan[]): BoundConstraint[] {
  return spans
    .filter((s) => s.kind === "CONSTRAINT")
    .map((s) => ({
      id: s.id,
      text: s.text,
      mode: inferConstraintMode(s.text),
      domain: POST_UI.test(s.text)
        ? "build"
        : PRE_TEMPORAL.test(s.text)
          ? "calendar"
          : undefined,
    }));
}

/** Apply PRE constraints to retrieval/calendar args when possible (best-effort). */
export function applyPreConstraints(
  args: Record<string, unknown>,
  constraints: BoundConstraint[],
): Record<string, unknown> {
  let out = { ...args };
  for (const c of constraints) {
    if (c.mode !== "PRE" && c.mode !== "BOTH") continue;
    const noon = c.text.match(/\bbefore\s+(noon|12\s*(?:pm|:00)?)\b/i);
    if (noon && typeof out.query === "string") {
      out = { ...out, query: `${out.query} after 12:00` };
    }
    const priceCap = c.text.match(/\bunder\s*\$?(\d+)/i);
    if (priceCap) {
      out = { ...out, maxPrice: Number.parseInt(priceCap[1]!, 10) };
    }
  }
  return out;
}
