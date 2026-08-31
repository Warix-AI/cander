/**
 * INTERPRET — Apple FM call #1: fully normalize user meaning before tools.
 * Spend latency here: understand asks, refs, temporal context, evidence needs.
 */

import type {
  AnswerShape,
  Cap,
  HydrateResult,
  Lookup,
  Plan,
} from "./types.ts";
import { syncPlanAliases } from "./types.ts";

const CAPS: Cap[] = [
  "WEB",
  "MEMORY",
  "FILES",
  "CALENDAR",
  "EMAIL",
  "CRM",
  "CALC",
  "BUILD",
];

const ANSWER_SHAPES: AnswerShape[] = [
  "direct",
  "breakdown",
  "comparison",
  "summary",
  "steps",
  "mixed",
];

function isCap(v: unknown): v is Cap {
  return typeof v === "string" && (CAPS as string[]).includes(v);
}

function isAnswerShape(v: unknown): v is AnswerShape {
  return typeof v === "string" && (ANSWER_SHAPES as string[]).includes(v);
}

function stringList(v: unknown, max = 12, slice = 300): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    .map((a) => a.trim().slice(0, slice))
    .slice(0, max);
}

function parseLookups(raw: unknown): Lookup[] {
  if (!Array.isArray(raw)) return [];
  const look: Lookup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isCap(row.cap) || typeof row.q !== "string" || !row.q.trim()) continue;
    look.push({
      cap: row.cap,
      q: row.q.trim().slice(0, 400),
      parallelGroup:
        typeof row.parallelGroup === "string"
          ? row.parallelGroup.slice(0, 40)
          : undefined,
    });
  }
  return look;
}

export function parsePlanJson(raw: string): Plan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed.intent !== "string" || !parsed.intent.trim()) return null;
    const asks = stringList(parsed.asks, 8, 300);
    const constraints = stringList(parsed.constraints, 8, 200);
    const entities = stringList(parsed.entities, 10, 120);
    const resolvedRefs = stringList(parsed.resolvedRefs, 10, 200);
    const unresolvedRefs = stringList(parsed.unresolvedRefs, 8, 200);
    const temporalContext = stringList(parsed.temporalContext, 8, 200);
    const expectedEvidence = stringList(parsed.expectedEvidence, 8, 200);
    const lookups = parseLookups(parsed.lookups ?? parsed.look);
    const freshnessRequired = Boolean(
      parsed.freshnessRequired ?? parsed.fresh,
    );
    const answerShape: AnswerShape = isAnswerShape(parsed.answerShape)
      ? parsed.answerShape
      : inferAnswerShape(parsed.intent, asks);

    return syncPlanAliases({
      intent: parsed.intent.trim().slice(0, 400),
      asks: asks.length
        ? asks
        : [parsed.intent.trim().slice(0, 300)],
      constraints,
      entities,
      resolvedRefs,
      unresolvedRefs,
      temporalContext,
      freshnessRequired,
      fresh: freshnessRequired,
      expectedEvidence,
      answerShape,
      lookups,
      look: lookups.length ? lookups : undefined,
      answer:
        typeof parsed.answer === "string" && parsed.answer.trim()
          ? parsed.answer.trim().slice(0, 2000)
          : undefined,
    });
  } catch {
    return null;
  }
}

function inferAnswerShape(intent: string, asks: string[]): AnswerShape {
  const blob = `${intent} ${asks.join(" ")}`.toLowerCase();
  if (/\bcompar|versus|\bvs\.?\b|difference between\b/.test(blob)) {
    return "comparison";
  }
  if (/\bstep|how (do|to)|walk me through|procedure\b/.test(blob)) {
    return "steps";
  }
  if (/\bbreakdown|break it down|itemize|list\b/.test(blob)) {
    return "breakdown";
  }
  if (/\bsummar|overview|tell me about|what (does|do) it\b/.test(blob)) {
    return "summary";
  }
  if (asks.length > 1) return "mixed";
  return "direct";
}

/** Code-side completeness self-check after INTERPRET (same pass, no extra FM). */
export function interpretSelfCheck(opts: {
  plan: Plan;
  hydrate: HydrateResult;
}): { ok: boolean; issues: string[]; plan: Plan } {
  const issues: string[] = [];
  let plan = syncPlanAliases({ ...opts.plan });
  const text = opts.hydrate.userText.toLowerCase();

  // Dropped asks: multi-part question with single short ask
  const multiAsk =
    (opts.hydrate.userText.match(/\?/g) ?? []).length >= 2 ||
    /\b.+\band\b.+\b(what|when|how|where|who|how far|how long)\b/i.test(
      opts.hydrate.userText,
    );
  if (multiAsk && plan.asks.length < 2) {
    issues.push("dropped_ask_parts");
  }

  // Constraints mentioned but missing
  if (
    /\b(only|must|without|except|before|after|under \$?\d|in \d{4})\b/i.test(
      opts.hydrate.userText,
    ) &&
    !plan.constraints.length
  ) {
    issues.push("dropped_constraints");
  }

  // URL / entity dropped
  for (const u of opts.hydrate.urls) {
    const mentioned =
      plan.entities.some((e) => e.toLowerCase().includes(u.domain)) ||
      plan.intent.toLowerCase().includes(u.domain) ||
      plan.asks.some((a) => a.toLowerCase().includes(u.domain)) ||
      (plan.lookups ?? []).some((l) => l.q.toLowerCase().includes(u.domain));
    if (!mentioned) issues.push(`dropped_entity:${u.domain}`);
  }

  // Temporal phrases resolved in hydrate but missing from plan
  for (const r of opts.hydrate.resolved) {
    if (/→/.test(r) && /today|this year|semester|tonight|this week/i.test(r)) {
      if (
        !plan.temporalContext.some((t) =>
          t.toLowerCase().includes(r.split("→")[0]?.trim().replace(/"/g, "") ?? ""),
        ) &&
        !plan.temporalContext.length
      ) {
        issues.push("dropped_temporal");
        break;
      }
    }
  }

  // Freshness signal in text but not marked
  if (
    /\b(today|this year|current|latest|news|score|schedule|price|semester)\b/i.test(
      text,
    ) &&
    !plan.freshnessRequired
  ) {
    issues.push("freshness_under_marked");
  }

  // expectedEvidence empty when lookups exist
  if ((plan.lookups?.length || plan.freshnessRequired) && !plan.expectedEvidence.length) {
    issues.push("missing_expected_evidence");
  }

  // Repair soft issues in-place (bounded, same INTERPRET pass — no second FM)
  if (issues.includes("freshness_under_marked")) {
    plan = syncPlanAliases({ ...plan, freshnessRequired: true, fresh: true });
  }
  if (issues.some((i) => i.startsWith("dropped_entity:"))) {
    const entities = [...plan.entities];
    for (const u of opts.hydrate.urls) {
      if (!entities.some((e) => e.toLowerCase().includes(u.domain))) {
        entities.push(u.domain);
      }
    }
    plan = syncPlanAliases({ ...plan, entities });
  }
  if (issues.includes("dropped_temporal") && opts.hydrate.resolved.length) {
    plan = syncPlanAliases({
      ...plan,
      temporalContext: [
        ...plan.temporalContext,
        ...opts.hydrate.resolved.filter((r) => /→/.test(r)),
      ].slice(0, 8),
    });
  }
  if (issues.includes("missing_expected_evidence")) {
    plan = syncPlanAliases({
      ...plan,
      expectedEvidence: plan.asks.map(
        (a) => `Verified answer for: ${a}`.slice(0, 200),
      ),
    });
  }
  if (issues.includes("dropped_ask_parts")) {
    const parts = opts.hydrate.userText
      .split(/\band\b|\?/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 8);
    if (parts.length >= 2) {
      plan = syncPlanAliases({
        ...plan,
        asks: parts.slice(0, 4).map((p) => p.slice(0, 300)),
        answerShape: plan.answerShape === "direct" ? "mixed" : plan.answerShape,
      });
    }
  }

  return { ok: issues.length === 0, issues, plan };
}

/** Deterministic INTERPRET fallback when FM is unavailable (tests / offline). */
export function planFromHydrateHeuristic(hydrate: HydrateResult): Plan {
  const urls = hydrate.urls;
  const freshnessRequired =
    /\b(today|this year|current|latest|news|score|weather|start|semester|schedule|price)\b/i.test(
      hydrate.userText,
    ) || hydrate.resolved.some((r) => /this year|today|semester/i.test(r));

  const temporalContext = hydrate.resolved.filter((r) => /→/.test(r));
  const entities = [
    ...urls.map((u) => u.domain),
    ...hydrate.entityHints,
  ].filter((v, i, a) => a.indexOf(v) === i);

  if (urls.length === 1) {
    const u = urls[0]!;
    return syncPlanAliases({
      intent: `inspect ${u.domain} and summarize what it offers`,
      asks: [`Summarize what ${u.domain} offers`],
      constraints: [],
      entities,
      resolvedRefs: hydrate.resolved.length
        ? hydrate.resolved
        : [`it = ${u.domain}`],
      unresolvedRefs: hydrate.unresolved,
      temporalContext,
      freshnessRequired: false,
      fresh: false,
      expectedEvidence: [
        `Readable page content from ${u.domain}`,
        `Description of what ${u.domain} offers`,
      ],
      answerShape: "summary",
      lookups: [{ cap: "WEB", q: u.url, parallelGroup: "url" }],
    });
  }

  const lookups: Lookup[] = [];
  if (
    freshnessRequired ||
    /\b(when|what|how far|distance|calories|news)\b/i.test(hydrate.userText)
  ) {
    const q = hydrate.topicHint
      ? `${hydrate.userText} (${hydrate.topicHint}, ${hydrate.year})`
      : `${hydrate.userText} ${hydrate.year}`;
    lookups.push({ cap: "WEB", q: q.slice(0, 400), parallelGroup: "primary" });
  }

  if (
    /\b(how far|distance|miles|km|round[- ]?trip|there and back)\b/i.test(
      hydrate.userText,
    )
  ) {
    lookups.push({
      cap: "CALC",
      q: hydrate.userText.slice(0, 400),
      parallelGroup: "primary",
    });
  }

  const asks =
    hydrate.userText.split(/\band\b|\?/i).map((p) => p.trim()).filter((p) => p.length > 8)
      .slice(0, 4);
  const askList = asks.length >= 2 ? asks.map((a) => a.slice(0, 300)) : [
    hydrate.userText.slice(0, 300),
  ];

  return syncPlanAliases({
    intent: hydrate.userText.slice(0, 400),
    asks: askList,
    constraints: [],
    entities,
    resolvedRefs: hydrate.resolved,
    unresolvedRefs: hydrate.unresolved,
    temporalContext,
    freshnessRequired,
    fresh: freshnessRequired,
    expectedEvidence: askList.map(
      (a) => `Current verified fact answering: ${a}`.slice(0, 200),
    ),
    answerShape: inferAnswerShape(hydrate.userText, askList),
    lookups,
  });
}

const INTERPRET_INSTRUCTIONS = [
  "You INTERPRET the user message once before any tools run.",
  "Return ONLY a JSON object matching this schema:",
  "{",
  '  "intent": string,',
  '  "asks": string[],',
  '  "constraints": string[],',
  '  "entities": string[],',
  '  "resolvedRefs": string[],',
  '  "unresolvedRefs": string[],',
  '  "temporalContext": string[],',
  '  "freshnessRequired": boolean,',
  '  "expectedEvidence": string[],',
  '  "answerShape": "direct"|"breakdown"|"comparison"|"summary"|"steps"|"mixed",',
  '  "lookups": [{ "cap": "WEB"|"MEMORY"|"FILES"|"CALENDAR"|"EMAIL"|"CRM"|"CALC"|"BUILD", "q": string, "parallelGroup"?: string }],',
  '  "answer"?: string',
  "}",
  "",
  "Determine explicitly:",
  "- intent: what the user ultimately wants",
  "- asks: every distinct ask (keep related parts together; split only independent asks)",
  "- constraints: hard requirements (location, year, budget, format, exclusions)",
  "- entities: people, orgs, products, domains/URLs involved",
  "- resolvedRefs / unresolvedRefs: pronoun and anaphora meanings; never invent bindings",
  "- temporalContext: today/this year/last season/etc. with resolved values from hydrate",
  "- freshnessRequired: true for schedules, news, prices, sports, school calendars, current facts",
  "- expectedEvidence: what would satisfy each ask (be concrete)",
  "- answerShape: how the final answer should be structured",
  "- lookups: minimum capabilities; use parallelGroup when independent lookups can run together",
  "",
  "Rules:",
  "- Preserve semantic relationships. Do NOT split filler like \"tell me about it\" from its target URL/entity.",
  "- Never create a lookup whose query is only filler (\"tell me about it\", \"what it offers\").",
  "- For URL/site inspection use lookups: [{ cap: \"WEB\", q: \"https://domain...\" }].",
  "- When freshnessRequired, include WEB lookups; do not invent live facts in answer.",
  "- Use conversation notes for follow-ups (e.g. first day under BYU topic).",
  "- Only set answer when no retrieval is needed (greetings, pure opinion).",
  "- Do not execute tools.",
  "",
  "SELF-CHECK before returning: ensure no meaningful user ask, constraint, entity/URL, or temporal cue was dropped. If anything was missing, include it in the JSON.",
].join("\n");

export async function planTurn(opts: {
  hydrate: HydrateResult;
  generate?: (prompt: string, instructions: string) => Promise<string>;
  useHeuristicOnly?: boolean;
}): Promise<{
  plan: Plan;
  raw?: string;
  usedHeuristic: boolean;
  selfCheckIssues: string[];
}> {
  if (opts.useHeuristicOnly || !opts.generate) {
    const plan = planFromHydrateHeuristic(opts.hydrate);
    const checked = interpretSelfCheck({ plan, hydrate: opts.hydrate });
    return {
      plan: checked.plan,
      usedHeuristic: true,
      selfCheckIssues: checked.issues,
    };
  }

  const generate = opts.generate;

  let raw = await generate(opts.hydrate.planPrompt, INTERPRET_INSTRUCTIONS);
  let plan = parsePlanJson(raw);
  if (!plan) {
    raw = await generate(
      `${opts.hydrate.planPrompt}\n\nPrevious output was invalid JSON. Return only the Plan JSON object. Re-check that no ask/constraint/entity was dropped.`,
      INTERPRET_INSTRUCTIONS,
    );
    plan = parsePlanJson(raw);
  }
  if (!plan) {
    const heuristic = planFromHydrateHeuristic(opts.hydrate);
    const checked = interpretSelfCheck({
      plan: heuristic,
      hydrate: opts.hydrate,
    });
    return {
      plan: checked.plan,
      raw,
      usedHeuristic: true,
      selfCheckIssues: checked.issues,
    };
  }

  const checked = interpretSelfCheck({ plan, hydrate: opts.hydrate });
  return {
    plan: checked.plan,
    raw,
    usedHeuristic: false,
    selfCheckIssues: checked.issues,
  };
}

/** @deprecated alias — INTERPRET owns planning */
export const PLAN_INSTRUCTIONS = INTERPRET_INSTRUCTIONS;
