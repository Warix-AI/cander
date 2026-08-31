/**
 * INTERPRET / NORMALIZE — turn messy language into atomic IntentPlan.
 * Highest-priority stage: spend latency here before any tool call.
 */

import type { HydrateResult, Intent, IntentAction, IntentPlan, Plan } from "./types.ts";
import {
  intentPlanToPlan,
  isIntentAction,
  normalizeIntentPlan,
} from "./types.ts";
import {
  buildCanonicalLookupQuery,
  heuristicCalorieIntents,
  looksLikeNarrativeQuery,
} from "./query-normalize.ts";

function stringList(v: unknown, max = 12, slice = 300): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    .map((a) => a.trim().slice(0, slice))
    .slice(0, max);
}

function parseIntent(raw: unknown, index: number): Intent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const actionRaw = row.action;
  if (!isIntentAction(actionRaw)) return null;
  const action: IntentAction = actionRaw;
  const goal =
    typeof row.goal === "string" && row.goal.trim()
      ? row.goal.trim().slice(0, 300)
      : "";
  if (!goal && action !== "ANSWER") return null;

  const entity =
    typeof row.entity === "string" && row.entity.trim()
      ? row.entity.trim().slice(0, 120)
      : undefined;
  const subject =
    typeof row.subject === "string" && row.subject.trim()
      ? row.subject.trim().slice(0, 200)
      : undefined;
  const quantity =
    typeof row.quantity === "number" && Number.isFinite(row.quantity)
      ? row.quantity
      : typeof row.quantity === "string" && /^\d+(\.\d+)?$/.test(row.quantity)
        ? Number(row.quantity)
        : undefined;

  let lookup: { q: string } | undefined;
  if (row.lookup && typeof row.lookup === "object") {
    const q = String((row.lookup as { q?: unknown }).q ?? "").trim();
    if (q) lookup = { q: q.slice(0, 400) };
  } else if (typeof row.q === "string" && row.q.trim()) {
    lookup = { q: row.q.trim().slice(0, 400) };
  }

  if (action !== "ANSWER" && action !== "CALC") {
    lookup = {
      q: buildCanonicalLookupQuery({
        entity,
        subject,
        goal: goal || undefined,
        action,
        quantity,
        rawQ: lookup?.q,
      }),
    };
  } else if (action === "CALC" && lookup) {
    lookup = {
      q: buildCanonicalLookupQuery({
        entity,
        subject,
        goal: goal || undefined,
        rawQ: lookup.q,
      }),
    };
  }

  const dependsOn = Array.isArray(row.dependsOn)
    ? row.dependsOn.map((d) => String(d)).filter(Boolean)
    : [];

  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : String(index + 1),
    goal: goal || "answer user",
    action,
    entity,
    subject,
    quantity,
    constraints: stringList(row.constraints, 8, 200),
    resolvedRefs: stringList(row.resolvedRefs, 8, 200),
    unresolvedRefs: stringList(row.unresolvedRefs, 8, 200),
    freshnessRequired: Boolean(row.freshnessRequired),
    dependsOn,
    lookup,
  };
}

export function parseIntentPlanJson(raw: string): IntentPlan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    // New schema
    if (Array.isArray(parsed.intents)) {
      const overall =
        typeof parsed.overallIntent === "string" && parsed.overallIntent.trim()
          ? parsed.overallIntent.trim()
          : typeof parsed.intent === "string"
            ? parsed.intent.trim()
            : "";
      if (!overall) return null;
      const intents: Intent[] = [];
      for (let i = 0; i < parsed.intents.length; i++) {
        const intent = parseIntent(parsed.intents[i], i);
        if (intent) intents.push(intent);
      }
      if (!intents.length) return null;
      return normalizeIntentPlan({
        overallIntent: overall.slice(0, 400),
        intents,
        answer:
          typeof parsed.answer === "string" && parsed.answer.trim()
            ? parsed.answer.trim().slice(0, 2000)
            : undefined,
      });
    }

    // Legacy Plan → IntentPlan adapter
    if (typeof parsed.intent === "string" && parsed.intent.trim()) {
      return legacyPlanObjectToIntentPlan(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated alias for tests that still call parsePlanJson */
export function parsePlanJson(raw: string): Plan | null {
  const ip = parseIntentPlanJson(raw);
  if (!ip) return null;
  return intentPlanToPlan(ip);
}

function legacyPlanObjectToIntentPlan(
  parsed: Record<string, unknown>,
): IntentPlan | null {
  const overall = String(parsed.intent ?? "").trim();
  if (!overall) return null;
  const asks = stringList(parsed.asks, 8, 300);
  const lookRaw = (parsed.lookups ?? parsed.look) as unknown;
  const lookups = Array.isArray(lookRaw) ? lookRaw : [];
  const intents: Intent[] = [];

  if (lookups.length) {
    for (let i = 0; i < lookups.length; i++) {
      const row = lookups[i] as Record<string, unknown>;
      const action = isIntentAction(row.cap) ? row.cap : "WEB";
      const q = typeof row.q === "string" ? row.q : "";
      intents.push({
        id: String(i + 1),
        goal: asks[i] ?? overall,
        action: action === "ANSWER" ? "WEB" : action,
        entity: undefined,
        subject: undefined,
        constraints: stringList(parsed.constraints, 8, 200),
        resolvedRefs: stringList(parsed.resolvedRefs, 8, 200),
        unresolvedRefs: stringList(parsed.unresolvedRefs, 8, 200),
        freshnessRequired: Boolean(parsed.freshnessRequired ?? parsed.fresh),
        dependsOn: [],
        lookup: q ? { q: buildCanonicalLookupQuery({ rawQ: q, goal: asks[i] }) } : undefined,
      });
    }
  } else {
    intents.push({
      id: "1",
      goal: asks[0] ?? overall,
      action: "ANSWER",
      constraints: stringList(parsed.constraints, 8, 200),
      resolvedRefs: stringList(parsed.resolvedRefs, 8, 200),
      unresolvedRefs: stringList(parsed.unresolvedRefs, 8, 200),
      freshnessRequired: false,
      dependsOn: [],
    });
  }

  return normalizeIntentPlan({
    overallIntent: overall.slice(0, 400),
    intents,
    answer:
      typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim().slice(0, 2000)
        : undefined,
  });
}

/** Deterministic INTERPRET when FM unavailable. */
export function intentPlanFromHydrateHeuristic(
  hydrate: HydrateResult,
): IntentPlan {
  const text = hydrate.userText;
  const calorieItems = heuristicCalorieIntents(text);
  if (calorieItems && calorieItems.length >= 1) {
    const intents: Intent[] = calorieItems.map((item, i) => ({
      id: String(i + 1),
      goal: item.goal,
      action: "WEB" as const,
      entity: item.entity,
      subject: item.subject,
      quantity: item.quantity,
      constraints: [],
      resolvedRefs: hydrate.resolved,
      unresolvedRefs: hydrate.unresolved,
      freshnessRequired: false,
      dependsOn: [],
      lookup: { q: item.q },
    }));
    const calcId = String(intents.length + 1);
    intents.push({
      id: calcId,
      goal: "calculate total calories",
      action: "CALC",
      constraints: [],
      resolvedRefs: [],
      unresolvedRefs: [],
      freshnessRequired: false,
      dependsOn: intents.filter((i) => i.action === "WEB").map((i) => i.id),
      lookup: { q: "sum calories from prior intents" },
    });
    return normalizeIntentPlan({
      overallIntent: "total calories from listed food and drink items",
      intents,
    });
  }

  if (hydrate.urls.length === 1) {
    const u = hydrate.urls[0]!;
    return normalizeIntentPlan({
      overallIntent: `inspect ${u.domain} and summarize what it offers`,
      intents: [
        {
          id: "1",
          goal: `summarize what ${u.domain} offers`,
          action: "WEB",
          entity: u.domain,
          subject: "site overview",
          constraints: [],
          resolvedRefs: hydrate.resolved.length
            ? hydrate.resolved
            : [`it = ${u.domain}`],
          unresolvedRefs: hydrate.unresolved,
          freshnessRequired: false,
          dependsOn: [],
          lookup: { q: u.url },
        },
      ],
    });
  }

  const fresh =
    /\b(today|this year|current|latest|news|score|weather|start|semester|schedule|price)\b/i.test(
      text,
    ) || hydrate.resolved.some((r) => /this year|today|semester/i.test(r));

  if (
    fresh ||
    /\b(when|what|how far|distance|calories|news)\b/i.test(text)
  ) {
    const entity =
      hydrate.entityHints[0] ??
      hydrate.topicHint?.split(/\s+/)[0] ??
      undefined;
    const q = buildCanonicalLookupQuery({
      entity,
      subject: fresh
        ? `${text.replace(/[?!.]/g, "").slice(0, 80)} ${hydrate.year}`.trim()
        : undefined,
      goal: text.slice(0, 200),
      rawQ: hydrate.topicHint
        ? `${hydrate.topicHint} ${hydrate.year}`
        : `${text.slice(0, 120)} ${hydrate.year}`,
    });
    const intents: Intent[] = [
      {
        id: "1",
        goal: text.slice(0, 300),
        action: "WEB",
        entity,
        subject: undefined,
        constraints: [],
        resolvedRefs: hydrate.resolved,
        unresolvedRefs: hydrate.unresolved,
        freshnessRequired: fresh,
        dependsOn: [],
        lookup: { q },
      },
    ];
    if (/\b(how far|distance|round[- ]?trip|there and back)\b/i.test(text)) {
      intents.push({
        id: "2",
        goal: "compute distance / round-trip duration",
        action: "CALC",
        constraints: [],
        resolvedRefs: [],
        unresolvedRefs: [],
        freshnessRequired: false,
        dependsOn: ["1"],
        lookup: { q: "calculate distance and round trip from evidence" },
      });
    }
    return normalizeIntentPlan({
      overallIntent: text.slice(0, 400),
      intents,
    });
  }

  return normalizeIntentPlan({
    overallIntent: text.slice(0, 400),
    intents: [
      {
        id: "1",
        goal: text.slice(0, 300),
        action: "ANSWER",
        constraints: [],
        resolvedRefs: hydrate.resolved,
        unresolvedRefs: hydrate.unresolved,
        freshnessRequired: false,
        dependsOn: [],
      },
    ],
    answer: undefined,
  });
}

/** @deprecated */
export function planFromHydrateHeuristic(hydrate: HydrateResult): Plan {
  return intentPlanToPlan(intentPlanFromHydrateHeuristic(hydrate));
}

/**
 * Semantic self-check before execution.
 * Returns repaired IntentPlan when soft issues can be fixed in one pass.
 */
export function interpretSelfCheck(opts: {
  plan: IntentPlan;
  hydrate: HydrateResult;
}): { ok: boolean; issues: string[]; plan: IntentPlan } {
  const issues: string[] = [];
  let plan = normalizeIntentPlan(opts.plan);
  const text = opts.hydrate.userText;

  // Every meaningful ask → intent
  const multi =
    (text.match(/\?/g) ?? []).length >= 2 ||
    /\b.+\band\b.+\b(what|when|how|calories|from)\b/i.test(text);
  if (multi && plan.intents.length < 2) {
    issues.push("missing_intent_coverage");
  }

  // Entities / URLs bound
  for (const u of opts.hydrate.urls) {
    const bound = plan.intents.some(
      (i) =>
        i.entity?.toLowerCase().includes(u.domain) ||
        i.lookup?.q.toLowerCase().includes(u.domain) ||
        i.goal.toLowerCase().includes(u.domain),
    );
    if (!bound) issues.push(`unbound_entity:${u.domain}`);
  }

  // Quantities preserved for calorie-style asks
  const qtyMention = text.match(
    /\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(regular\s+)?(tacos?|burgers?|slices?)\b/i,
  );
  if (qtyMention && !plan.intents.some((i) => i.quantity && i.quantity > 1)) {
    issues.push("quantity_dropped");
  }

  // Pronouns
  if (
    /\b(it|that|this|them)\b/i.test(text) &&
    opts.hydrate.unresolved.some((u) => /pronoun|ambiguous/i.test(u)) &&
    !plan.intents.some((i) => i.unresolvedRefs.length)
  ) {
    // hydrate already flagged — copy into intents
    issues.push("pronoun_unmarked");
  }

  // Lookup queries clean
  for (const intent of plan.intents) {
    if (intent.lookup && looksLikeNarrativeQuery(intent.lookup.q)) {
      issues.push(`narrative_query:${intent.id}`);
    }
    if (
      intent.action !== "ANSWER" &&
      intent.action !== "CALC" &&
      !intent.lookup?.q
    ) {
      issues.push(`missing_lookup:${intent.id}`);
    }
  }

  // Dependencies: CALC without dependsOn when other WEB intents exist
  const webIds = plan.intents.filter((i) => i.action === "WEB").map((i) => i.id);
  for (const intent of plan.intents) {
    if (
      intent.action === "CALC" &&
      webIds.length &&
      !intent.dependsOn.length
    ) {
      issues.push(`calc_missing_deps:${intent.id}`);
    }
  }

  // —— one bounded repair ——
  const repaired = plan.intents.map((intent) => {
    let next = { ...intent };
    if (
      intent.lookup &&
      (looksLikeNarrativeQuery(intent.lookup.q) ||
        issues.includes(`narrative_query:${intent.id}`))
    ) {
      next = {
        ...next,
        lookup: {
          q: buildCanonicalLookupQuery({
            entity: intent.entity,
            subject: intent.subject,
            goal: intent.goal,
            quantity: intent.quantity,
            rawQ: intent.lookup.q,
          }),
        },
      };
    }
    if (
      intent.action === "CALC" &&
      webIds.length &&
      !intent.dependsOn.length
    ) {
      next = { ...next, dependsOn: [...webIds] };
    }
    return next;
  });

  // Calorie compound repair if coverage missing
  if (issues.includes("missing_intent_coverage")) {
    const calorie = heuristicCalorieIntents(text);
    if (calorie && calorie.length >= 2) {
      return {
        ok: false,
        issues,
        plan: intentPlanFromHydrateHeuristic(opts.hydrate),
      };
    }
  }

  for (const u of opts.hydrate.urls) {
    if (!repaired.some((i) => i.lookup?.q.includes(u.domain) || i.entity === u.domain)) {
      repaired.push({
        id: String(repaired.length + 1),
        goal: `summarize ${u.domain}`,
        action: "WEB",
        entity: u.domain,
        subject: "site overview",
        constraints: [],
        resolvedRefs: [`it = ${u.domain}`],
        unresolvedRefs: [],
        freshnessRequired: false,
        dependsOn: [],
        lookup: { q: u.url },
      });
    }
  }

  if (issues.includes("quantity_dropped") && qtyMention) {
    const map: Record<string, number> = {
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const raw = qtyMention[1]!.toLowerCase();
    const n = map[raw] ?? Number(raw) ?? 1;
    if (repaired[0] && repaired[0].action === "WEB") {
      repaired[0] = { ...repaired[0], quantity: n };
    }
  }

  if (issues.includes("pronoun_unmarked")) {
    for (let i = 0; i < repaired.length; i++) {
      repaired[i] = {
        ...repaired[i]!,
        unresolvedRefs: [
          ...repaired[i]!.unresolvedRefs,
          ...opts.hydrate.unresolved,
        ],
        resolvedRefs: [
          ...repaired[i]!.resolvedRefs,
          ...opts.hydrate.resolved,
        ],
      };
    }
  }

  plan = normalizeIntentPlan({
    overallIntent: plan.overallIntent,
    intents: repaired,
    answer: plan.answer,
  });

  const hard = issues.filter(
    (i) =>
      i.startsWith("unbound_entity") ||
      i.startsWith("missing_lookup") ||
      i === "missing_intent_coverage",
  );
  // Re-check narrative queries after repair
  const stillNarrative = plan.intents.some(
    (i) => i.lookup && looksLikeNarrativeQuery(i.lookup.q),
  );
  return {
    ok: hard.length === 0 && !stillNarrative,
    issues,
    plan,
  };
}

const INTERPRET_INSTRUCTIONS = [
  "You INTERPRET/NORMALIZE the user message into atomic intents BEFORE any tools run.",
  "Return ONLY JSON:",
  "{",
  '  "overallIntent": string,',
  '  "intents": [{',
  '    "id": string,',
  '    "goal": string,',
  '    "action": "ANSWER"|"WEB"|"MEMORY"|"FILES"|"CALENDAR"|"EMAIL"|"CRM"|"CALC"|"BUILD",',
  '    "entity"?: string,',
  '    "subject"?: string,',
  '    "quantity"?: number,',
  '    "constraints": string[],',
  '    "resolvedRefs": string[],',
  '    "unresolvedRefs": string[],',
  '    "freshnessRequired": boolean,',
  '    "dependsOn": string[],',
  '    "lookup"?: { "q": string }',
  "  }],",
  '  "answer"?: string',
  "}",
  "",
  "Process:",
  "1) Understand the ENTIRE message before splitting.",
  "2) Identify every distinct ask.",
  "3) Preserve relationships between entities, quantities, pronouns, dates, URLs, constraints, and actions.",
  "4) Separate independent intents from dependent ones (dependsOn).",
  "5) Resolve conversational references from notes; mark ambiguity in unresolvedRefs — never guess.",
  "6) Generate CANONICAL lookup queries from normalized meaning — never copy raw sentence fragments.",
  "",
  "Query rules (critical):",
  '- Bad: "Taco Bell If I eat three regular tacos"',
  '- Good: "Taco Bell regular taco calories"',
  '- Bad: "McDonald\'s I have a medium Sprite"',
  '- Good: "McDonald\'s medium Sprite calories"',
  "- lookup.q describes the FACT needed, not the user's wording.",
  "",
  "Example — calories from two brands → two WEB intents (parallel) + one CALC (dependsOn both).",
  "URL inspect → one WEB intent with lookup.q = https://domain...",
  "Independent intents: dependsOn=[]. Dependent: list prior intent ids.",
  "Only set answer when action is ANSWER and no retrieval is needed.",
  "Do not execute tools. Do not invent live facts.",
  "",
  "SELF-CHECK before returning:",
  "- Did every meaningful ask become an intent?",
  "- Are entities/actions bound?",
  "- Are quantities preserved?",
  "- Are pronouns resolved or marked unresolved?",
  "- Are date refs normalized into constraints/resolvedRefs?",
  "- Are lookup queries clean standalone queries?",
  "- Are dependencies correct?",
].join("\n");

export async function planTurn(opts: {
  hydrate: HydrateResult;
  generate?: (prompt: string, instructions: string) => Promise<string>;
  useHeuristicOnly?: boolean;
}): Promise<{
  plan: IntentPlan;
  flatPlan: Plan;
  raw?: string;
  usedHeuristic: boolean;
  selfCheckIssues: string[];
}> {
  const finish = (
    ip: IntentPlan,
    meta: { raw?: string; usedHeuristic: boolean },
  ) => {
    const checked = interpretSelfCheck({
      plan: ip,
      hydrate: opts.hydrate,
    });
    return {
      plan: checked.plan,
      flatPlan: intentPlanToPlan(checked.plan),
      raw: meta.raw,
      usedHeuristic: meta.usedHeuristic,
      selfCheckIssues: checked.issues,
    };
  };

  if (opts.useHeuristicOnly || !opts.generate) {
    return finish(intentPlanFromHydrateHeuristic(opts.hydrate), {
      usedHeuristic: true,
    });
  }

  let raw = await opts.generate(opts.hydrate.planPrompt, INTERPRET_INSTRUCTIONS);
  let parsed = parseIntentPlanJson(raw);
  if (!parsed) {
    raw = await opts.generate(
      `${opts.hydrate.planPrompt}\n\nPrevious output was invalid. Return only IntentPlan JSON. Re-check coverage, bindings, quantities, clean queries, and dependsOn.`,
      INTERPRET_INSTRUCTIONS,
    );
    parsed = parseIntentPlanJson(raw);
  }
  if (!parsed) {
    return finish(intentPlanFromHydrateHeuristic(opts.hydrate), {
      raw,
      usedHeuristic: true,
    });
  }
  return finish(parsed, { raw, usedHeuristic: false });
}

export { INTERPRET_INSTRUCTIONS as PLAN_INSTRUCTIONS };
