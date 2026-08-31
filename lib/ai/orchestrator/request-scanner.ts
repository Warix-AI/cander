/**
 * Deterministic request scanner — Phase 0 of v4 orchestration.
 * Splits a user turn into spans; classifies ASK | CONSTRAINT | CONTEXT.
 * Ask fidelity escalation (AskExtractor) is a later phase — this is instrumentation only.
 */

export type SpanKind = "ASK" | "CONSTRAINT" | "CONTEXT";

export type RequestSpan = {
  id: string;
  text: string;
  kind: SpanKind;
  /** Rule that produced the classification (for eval/debug). */
  rule: string;
};

export type RequestLedger = {
  rawInput: string;
  spans: RequestSpan[];
  asks: RequestSpan[];
  constraints: RequestSpan[];
  context: RequestSpan[];
  urls: string[];
  /** Explicit app/product mentions detected in the message. */
  explicitApps: string[];
  /** Signals that may warrant AskExtractor escalation (Phase 1+). */
  askExtractorTriggers: string[];
};

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const APP_MENTIONS =
  /\b(gmail|google calendar|calendar|hubspot|salesforce|slack|notion|vercel|github|outlook|teams)\b/gi;

const CONSTRAINT_PATTERNS: Array<{ re: RegExp; rule: string }> = [
  { re: /\bdon'?t\b[\s\S]{0,80}/i, rule: "negative_imperative" },
  { re: /\bdo not\b[\s\S]{0,80}/i, rule: "do_not" },
  { re: /\bnothing (before|after|from)\b[\s\S]{0,60}/i, rule: "temporal_bound" },
  { re: /\b(before|after)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i, rule: "time_bound" },
  { re: /\bunder\s*\$?\d+/i, rule: "price_cap" },
  { re: /\bover\s*\$?\d+/i, rule: "price_floor" },
  { re: /\bno\s+[A-Za-z][\w\s.-]{1,40}\b/i, rule: "exclude_entity" },
  { re: /\b(exclude|without|avoid)\b[\s\S]{0,60}/i, rule: "exclude" },
  { re: /\b(must not|should not|can'?t|cannot)\b[\s\S]{0,60}/i, rule: "prohibition" },
  { re: /\bkeep it\b[\s\S]{0,40}/i, rule: "style_constraint" },
];

const ASK_PATTERNS: Array<{ re: RegExp; rule: string }> = [
  { re: /\?/, rule: "question_mark" },
  { re: /^(check|compare|tell me|find|look up|look at|review|schedule|send|draft|create|add|remove|delete|list|show|summarize|explain|write)\b/i, rule: "leading_imperative" },
  { re: /\b(check whether|compare|tell me if|find out|look up|how many|how much|what is|who is|when is|where is)\b/i, rule: "ask_phrase" },
  { re: /\b(if .{8,40},?\s+(then )?(schedule|send|create|add))\b/i, rule: "conditional_ask" },
];

function slugSpan(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return `s${index}_${base || "span"}`;
}

/** Split message into clause-level spans (deterministic, not semantic). */
export function splitRequestSpans(rawInput: string): string[] {
  const text = rawInput.trim();
  if (!text) return [];

  const splitRe =
    /\s*(?:;\s*|\.\s+(?=[A-Z])|,\s*(?=check|compare|tell|find|schedule|send|draft|create|list|show|and if\b)|\s+but\s+(?=nothing|don't|do not|no\s|never|under|over|exclude|must not|should not)|\s+and\s+(?=check|compare|tell|find|schedule|send|draft|create|list|show|whether|don't|nothing|do not|no\s|never)\b)/i;

  const parts = text
    .split(splitRe)
    .map((p) => p.trim().replace(/^,\s*/, ""))
    .filter((p) => p.length >= 2);

  if (parts.length <= 1) return [text];
  return parts;
}

function classifySpan(text: string): { kind: SpanKind; rule: string } {
  if (
    /^(check|compare|tell me|find|look up|look at|review|schedule|send|draft|create|add|remove|delete|list|show|summarize|explain|write|can you)\b/i.test(
      text,
    )
  ) {
    return { kind: "ASK", rule: "leading_imperative" };
  }
  for (const { re, rule } of ASK_PATTERNS) {
    if (re.test(text)) {
      return { kind: "ASK", rule };
    }
  }
  for (const { re, rule } of CONSTRAINT_PATTERNS) {
    if (re.test(text)) {
      return { kind: "CONSTRAINT", rule };
    }
  }
  if (/\bwhether\b/i.test(text)) {
    return { kind: "ASK", rule: "whether_clause" };
  }
  return { kind: "CONTEXT", rule: "default" };
}

function detectAskExtractorTriggers(opts: {
  rawInput: string;
  spans: RequestSpan[];
}): string[] {
  const triggers: string[] = [];
  const qCount = (opts.rawInput.match(/\?/g) ?? []).length;
  const askCount = opts.spans.filter((s) => s.kind === "ASK").length;

  if (qCount >= 2 && askCount < qCount) {
    triggers.push("multiple_question_marks_few_asks");
  }
  if (
    opts.rawInput.length > 80 &&
    askCount === 0 &&
    /\b(whether|worth|trying to|figure out|work out)\b/i.test(opts.rawInput)
  ) {
    triggers.push("implicit_ask_shape");
  }
  if (
    opts.rawInput.length > 80 &&
    askCount >= 1 &&
    /\b(whether|worth|trying to|figure out|work out)\b/i.test(opts.rawInput)
  ) {
    triggers.push("implicit_ask_shape");
  }
  if (
    /\b(it|that|this|they|them)\b/i.test(opts.rawInput) &&
    opts.spans.some((s) => s.kind === "ASK" && /\b(it|that|this)\b/i.test(s.text))
  ) {
    triggers.push("unbound_pronoun_in_ask");
  }
  const conjCount = (opts.rawInput.match(/\band\b/gi) ?? []).length;
  if (conjCount >= 2 && askCount <= 1 && opts.rawInput.length > 80) {
    triggers.push("multi_clause_single_ask");
  }
  return triggers;
}

/** Scan a user turn into a RequestLedger (deterministic, no model). */
export function scanRequest(rawInput: string): RequestLedger {
  const text = rawInput.trim();
  const clauseTexts = splitRequestSpans(text);
  const spans: RequestSpan[] = clauseTexts.map((clause, i) => {
    const { kind, rule } = classifySpan(clause);
    return {
      id: slugSpan(clause, i),
      text: clause,
      kind,
      rule,
    };
  });

  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;]+$/, "")))];
  const explicitApps = [
    ...new Set(
      (text.match(APP_MENTIONS) ?? []).map((a) => a.toLowerCase()),
    ),
  ];

  const askExtractorTriggers = detectAskExtractorTriggers({ rawInput: text, spans });

  return {
    rawInput: text,
    spans,
    asks: spans.filter((s) => s.kind === "ASK"),
    constraints: spans.filter((s) => s.kind === "CONSTRAINT"),
    context: spans.filter((s) => s.kind === "CONTEXT"),
    urls,
    explicitApps,
    askExtractorTriggers,
  };
}
