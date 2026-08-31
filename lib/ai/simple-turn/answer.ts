/**
 * ANSWER — deterministic scalar first; FM synthesis only when needed.
 */

import type {
  AnswerPacket,
  CommitNotes,
  HydrateResult,
  IntentResult,
  Plan,
  SimpleEvidence,
} from "./types.ts";

function parseAnswerJson(raw: string): {
  answer: string;
  topic?: string;
  entities?: string[];
  facts?: string[];
} | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    const text = raw.trim();
    if (text.length > 0) return { answer: text.slice(0, 4000) };
    return null;
  }
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
    return {
      answer: parsed.answer.trim().slice(0, 4000),
      topic:
        typeof parsed.topic === "string" ? parsed.topic.slice(0, 80) : undefined,
      entities: Array.isArray(parsed.entities)
        ? parsed.entities
            .filter((e): e is string => typeof e === "string")
            .slice(0, 5)
        : undefined,
      facts: Array.isArray(parsed.facts)
        ? parsed.facts
            .filter((f): f is string => typeof f === "string")
            .slice(0, 5)
        : undefined,
    };
  } catch {
    const text = raw.trim();
    return text ? { answer: text.slice(0, 4000) } : null;
  }
}

function isSimpleScalarEvidence(items: SimpleEvidence[]): string | null {
  if (items.length !== 1) return null;
  const e = items[0]!;
  const text = e.content.trim();
  // Short Exa-style direct answers / dates / distances
  if (text.length > 0 && text.length <= 280) {
    if (
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i.test(
        text,
      ) ||
      /^\s*[\d.,]+\s*(miles|km|kilometers|calories|cal|minutes?|hours?)\b/i.test(
        text,
      ) ||
      /^[^.\n]{8,120}\.\s*$/.test(text)
    ) {
      return text;
    }
  }
  // Prefer title+first sentence for single web.read of a known site when short enough
  if (e.sourceTool === "web.read" && text.length <= 400) {
    const first = text.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 40);
    if (first && first.length <= 280) return first;
  }
  return null;
}

function needsSynthesis(plan: Plan, evidence: SimpleEvidence[]): boolean {
  if (plan.asks.length > 1) return true;
  if (
    plan.answerShape === "comparison" ||
    plan.answerShape === "breakdown" ||
    plan.answerShape === "steps" ||
    plan.answerShape === "mixed"
  ) {
    return true;
  }
  if (/summar|compar|explain|draft|nuance|caveat/i.test(plan.intent)) return true;
  if (evidence.length > 1) return true;
  if (evidence.some((e) => e.content.length > 400)) return true;
  return false;
}

const SYNTHESIS_INSTRUCTIONS = [
  "Write the final user-facing answer from accepted evidence only.",
  "Return JSON: { \"answer\": string, \"topic\"?: string, \"entities\"?: string[], \"facts\"?: string[] }",
  "Rules:",
  "- Lead with the direct answer.",
  "- Do not invent live facts not in evidence.",
  "- Do not paste raw search dumps or long URLs.",
  "- Keep topic/entities/facts short (for conversation notes).",
  "- If evidence is incomplete, say what could not be verified briefly.",
].join("\n");

export async function answerTurn(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  accepted: SimpleEvidence[];
  unresolved?: boolean;
  unresolvedReason?: string;
  generate?: (prompt: string, instructions: string) => Promise<string>;
  useHeuristicOnly?: boolean;
  intentResults?: IntentResult[];
}): Promise<AnswerPacket> {
  if (opts.unresolved) {
    const reason = opts.unresolvedReason ?? "";
    const freshFail =
      /fresh|no fresh|won'?t guess|live information|unresolved/i.test(reason) ||
      reason.includes("WEB selected");
    return {
      answer: freshFail
        ? "I couldn't retrieve live information for that question, so I won't guess. Please try again in a moment."
        : `I couldn't verify that reliably${
            reason ? ` (${reason})` : ""
          }. Please try again.`,
      path: "unresolved",
      topic: opts.hydrate.topicHint,
      entities: opts.hydrate.entityHints.slice(0, 5),
      facts: [],
    };
  }

  // Direct answer from PLAN when no retrieval needed
  if (
    !(opts.plan.lookups?.length || opts.plan.look?.length) &&
    opts.plan.answer?.trim() &&
    !opts.plan.freshnessRequired &&
    !opts.plan.fresh
  ) {
    return {
      answer: opts.plan.answer.trim(),
      path: "deterministic",
      topic: opts.hydrate.topicHint,
      entities: opts.hydrate.entityHints.slice(0, 5),
    };
  }

  const scalar = isSimpleScalarEvidence(opts.accepted);
  if (scalar && !needsSynthesis(opts.plan, opts.accepted)) {
    return {
      answer: scalar,
      path: "deterministic",
      topic: opts.hydrate.topicHint ?? opts.hydrate.urls[0]?.domain,
      entities: [
        ...opts.hydrate.entityHints,
        ...(opts.hydrate.urls.map((u) => u.domain) ?? []),
      ].slice(0, 5),
      facts: [scalar.slice(0, 160)],
    };
  }

  if (opts.useHeuristicOnly || !opts.generate) {
    // Deterministic summary from evidence without FM
    const bits = opts.accepted
      .map((e) => e.content.trim().slice(0, 400))
      .filter(Boolean);
    const answer = bits.length
      ? bits.join("\n\n").slice(0, 1500)
      : opts.plan.answer?.trim() ||
        "I couldn't find enough verified information to answer that.";
    return {
      answer,
      path: bits.length ? "deterministic" : "unresolved",
      topic: opts.hydrate.topicHint ?? opts.hydrate.urls[0]?.domain,
      entities: opts.hydrate.entityHints.slice(0, 5),
      facts: bits.slice(0, 3).map((b) => b.slice(0, 160)),
    };
  }

  const generate =
    opts.generate ??
    (async (prompt: string, instructions: string) => {
      const { generateFmTurn } = await import("../runtime/native/fm-generate.ts");
      const fm = await generateFmTurn({ prompt, instructions });
      return fm.text;
    });

  const evidenceBlock = opts.accepted
    .map(
      (e, i) =>
        `[${i + 1}] ${e.title}${e.url ? ` (${e.url})` : ""}${
          e.intentId ? ` intent=${e.intentId}` : ""
        }\n${e.content.slice(0, 1200)}`,
    )
    .join("\n\n");

  const intentBlock = opts.intentResults?.length
    ? [
        "## Normalized intents",
        ...opts.intentResults.map(
          (r) =>
            `- [${r.intent.id}] ${r.intent.goal} (${r.intent.action}` +
            `${r.intent.quantity != null ? `, qty=${r.intent.quantity}` : ""}` +
            `${r.intent.entity ? `, entity=${r.intent.entity}` : ""}) → ${r.status}` +
            `${r.intent.lookup?.q ? ` | q="${r.intent.lookup.q}"` : ""}`,
        ),
        "",
      ].join("\n")
    : "";

  const prompt = [
    "## Hydrated intent",
    opts.plan.intent,
    "",
    intentBlock,
    "## Asks",
    ...opts.plan.asks.map((a) => `- ${a}`),
    "",
    "## Constraints",
    opts.plan.constraints.length
      ? opts.plan.constraints.map((c) => `- ${c}`).join("\n")
      : "- (none)",
    "",
    "## Accepted evidence",
    evidenceBlock || "(none)",
    "",
    opts.hydrate.temporalLine,
    "",
    "Combine quantities from intents with per-unit facts from evidence when calculating totals.",
    "Do not ask the user to split the question into separate prompts.",
  ].join("\n");

  const raw = await generate(prompt, SYNTHESIS_INSTRUCTIONS);
  const parsed = parseAnswerJson(raw);
  if (!parsed) {
    return {
      answer:
        "I couldn't finish synthesizing that answer. Please try again in a moment.",
      path: "unresolved",
    };
  }
  return {
    ...parsed,
    path: "fm_synthesis",
  };
}

export function mergeCommitNotes(
  prior: CommitNotes,
  packet: AnswerPacket,
  hydrate: HydrateResult,
): CommitNotes {
  const topic =
    packet.topic ??
    hydrate.topicHint ??
    hydrate.urls[0]?.domain ??
    prior.topic;
  const entities = [
    ...(packet.entities ?? []),
    ...hydrate.entityHints,
    ...prior.entities,
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);
  const facts = [
    ...(packet.facts ?? []),
    ...prior.facts,
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);
  return { topic, entities, facts };
}
