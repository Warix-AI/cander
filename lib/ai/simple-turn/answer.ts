/**
 * ANSWER — Exa Deep text as-is for WEB; no FM rewrite of validated web facts.
 * FM only for non-web / no-retrieval turns.
 */

import {
  formatExaPassthroughAnswer,
  lightFormatExaText,
  logExaDeep,
} from "./exa-deep.ts";
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
    const answer = freshFail
      ? "I couldn't retrieve live information for that question, so I won't guess. Please try again in a moment."
      : `I couldn't verify that reliably${
          reason ? ` (${reason})` : ""
        }. Please try again.`;
    logExaDeep({
      stage: "final",
      validationResult: `unresolved:${reason || "unknown"}`,
      finalText: answer,
      ok: false,
    });
    return {
      answer,
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

  const webEvidence = opts.accepted.filter(
    (e) => e.cap === "WEB" && e.content.trim().length >= 8,
  );
  const needsCalc = opts.intentResults?.some(
    (r) => r.intent.action === "CALC" && r.status === "succeeded",
  );
  const urlOnly =
    webEvidence.length > 0 &&
    webEvidence.every((e) => e.sourceTool === "web.read");

  // Validated Exa Deep (or direct URL fetch) → return essentially as-is. No FM rewrite.
  if (webEvidence.length && !needsCalc) {
    const answer = formatExaPassthroughAnswer(webEvidence);
    if (answer) {
      logExaDeep({
        stage: "final",
        validationResult: "accepted_passthrough",
        finalText: answer,
        citations: webEvidence.slice(0, 3).map((e) => ({
          title: e.title,
          url: e.url,
        })),
        ok: true,
      });
      return {
        answer,
        path: urlOnly ? "deterministic" : "exa_deep",
        topic: opts.hydrate.topicHint ?? opts.hydrate.urls[0]?.domain,
        entities: [
          ...opts.hydrate.entityHints,
          ...opts.hydrate.urls.map((u) => u.domain),
        ].slice(0, 5),
        facts: webEvidence.slice(0, 3).map((e) =>
          lightFormatExaText(e.content).slice(0, 160),
        ),
      };
    }
  }

  // WEB + CALC: pass Exa facts through; light combine without inventing numbers
  if (webEvidence.length && needsCalc) {
    const facts = formatExaPassthroughAnswer(webEvidence);
    const qtyLines =
      opts.intentResults
        ?.filter((r) => r.intent.action === "WEB" && r.intent.quantity != null)
        .map(
          (r) =>
            `${r.intent.quantity}× ${r.intent.entity ?? ""} ${r.intent.subject ?? r.intent.goal}`.trim(),
        ) ?? [];
    const answer = [facts, qtyLines.length ? `Quantities: ${qtyLines.join("; ")}` : ""]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);
    logExaDeep({
      stage: "final",
      validationResult: "accepted_passthrough_with_calc",
      finalText: answer,
      ok: true,
    });
    return {
      answer,
      path: "exa_deep",
      topic: opts.hydrate.topicHint,
      entities: opts.hydrate.entityHints.slice(0, 5),
      facts: webEvidence.slice(0, 3).map((e) =>
        lightFormatExaText(e.content).slice(0, 160),
      ),
    };
  }

  if (opts.useHeuristicOnly || !opts.generate) {
    const bits = opts.accepted
      .map((e) => lightFormatExaText(e.content).slice(0, 400))
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

  // Non-web turns only — never rewrite a validated Exa web answer via FM
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
    "Do not invent live web facts. Do not ask the user to split the question.",
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
