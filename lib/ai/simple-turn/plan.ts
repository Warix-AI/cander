/**
 * INTERPRET / NORMALIZE — turn messy language into atomic IntentPlan.
 * Highest-priority stage: spend latency here before any tool call.
 */

import type {
  HydrateResult,
  Intent,
  IntentAction,
  IntentCondition,
  IntentNeedsFrom,
  IntentPlan,
  Plan,
} from "./types.ts";
import {
  intentPlanToPlan,
  isIntentAction,
  normalizeCondition,
  normalizeIntentPlan,
  normalizeNeedsFrom,
} from "./types.ts";
import {
  buildCanonicalLookupQuery,
  heuristicCalorieIntents,
  looksLikeNarrativeQuery,
} from "./query-normalize.ts";
import {
  buildInterpretInstructions,
  buildPlanHealth,
  classifyDeliberationDepth,
  type DeliberationDepth,
  type PlanHealth,
} from "./deliberation.ts";

function stringList(v: unknown, max = 12, slice = 300): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    .map((a) => a.trim().slice(0, slice))
    .slice(0, max);
}

function parseCondition(raw: unknown): IntentCondition | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  return normalizeCondition({
    intentId: String(row.intentId ?? ""),
    operator: (typeof row.operator === "string"
      ? row.operator
      : "exists") as IntentCondition["operator"],
    value: typeof row.value === "string" ? row.value : undefined,
  });
}

function parseNeedsFrom(raw: unknown): IntentNeedsFrom | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const fields = Array.isArray(row.fields)
    ? row.fields.filter((f): f is string => typeof f === "string")
    : [];
  return normalizeNeedsFrom({
    intentId: String(row.intentId ?? ""),
    fields,
  });
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

  if (action !== "ANSWER" && action !== "CALC" && action !== "CALENDAR") {
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
  } else if ((action === "CALC" || action === "CALENDAR") && lookup) {
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
    condition: parseCondition(row.condition),
    needsFrom: parseNeedsFrom(row.needsFrom),
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

  const conditionalCal = heuristicConditionalCalendarPlan(hydrate);
  if (conditionalCal) return conditionalCal;

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

/**
 * Heuristic: multi-ask sports schedule + conditional calendar write.
 * Example: BYU next game + vs Utah + if they do add to calendar.
 */
export function heuristicConditionalCalendarPlan(
  hydrate: HydrateResult,
): IntentPlan | null {
  const text = hydrate.userText;
  if (!/\bcalendar\b/i.test(text)) return null;
  if (!/\bif (they|it|that)\b/i.test(text)) return null;

  const teamMatch = text.match(
    /\b(BYU|Utah|USC|UCLA|Stanford|Oregon|Alabama|Ohio State)\b/i,
  );
  const vsMatch = text.match(
    /\b(?:play|vs\.?|versus)\s+(BYU|Utah|USC|UCLA|Stanford|Oregon|[A-Z][a-z]+)\b/i,
  );
  if (!teamMatch) return null;

  const team = teamMatch[1]!;
  const opponent =
    vsMatch?.[1] && vsMatch[1].toLowerCase() !== team.toLowerCase()
      ? vsMatch[1]
      : text.match(/\bUtah\b/i) && !/^utah$/i.test(team)
        ? "Utah"
        : null;
  if (!opponent) return null;

  const year = String(hydrate.year);
  const refs = [
    ...hydrate.resolved,
    `they = ${team}`,
    `it = ${team} vs ${opponent} game`,
  ];

  return normalizeIntentPlan({
    overallIntent: `${team} football schedule and conditional calendar add for ${opponent}`,
    intents: [
      {
        id: "1",
        goal: `find ${team}'s next football game`,
        action: "WEB",
        entity: team,
        subject: "next football game",
        constraints: [`season ${year}`],
        resolvedRefs: refs,
        unresolvedRefs: hydrate.unresolved,
        freshnessRequired: true,
        dependsOn: [],
        lookup: {
          q: buildCanonicalLookupQuery({
            entity: team,
            subject: `next football game ${year}`,
          }),
        },
      },
      {
        id: "2",
        goal: `determine whether ${team} plays ${opponent} this season`,
        action: "WEB",
        entity: team,
        subject: `vs ${opponent} ${year}`,
        constraints: [`season ${year}`],
        resolvedRefs: refs,
        unresolvedRefs: [],
        freshnessRequired: true,
        dependsOn: [],
        lookup: {
          q: buildCanonicalLookupQuery({
            entity: team,
            subject: `vs ${opponent} football schedule ${year}`,
          }),
        },
      },
      {
        id: "3",
        goal: `add ${team} vs ${opponent} game to calendar if scheduled`,
        action: "CALENDAR",
        entity: `${team} vs ${opponent}`,
        subject: "calendar event",
        constraints: ["require confirmation before write"],
        resolvedRefs: [`it = ${team} vs ${opponent} game`],
        unresolvedRefs: [],
        freshnessRequired: false,
        dependsOn: ["2"],
        condition: { intentId: "2", operator: "exists" },
        needsFrom: {
          intentId: "2",
          fields: ["title", "date", "kickoff time", "location"],
        },
        lookup: {
          q: `${team} vs ${opponent} calendar event`,
        },
      },
    ],
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

  // Conditional writes should carry condition + needsFrom
  if (
    /\bif (they|it|that)\b/i.test(text) &&
    /\bcalendar\b/i.test(text) &&
    !plan.intents.some((i) => i.condition)
  ) {
    issues.push("missing_condition");
  }
  for (const intent of plan.intents) {
    if (
      intent.action === "CALENDAR" &&
      intent.condition &&
      !intent.needsFrom
    ) {
      issues.push(`calendar_missing_needsFrom:${intent.id}`);
    }
    if (
      intent.condition &&
      !plan.intents.some((i) => i.id === intent.condition!.intentId)
    ) {
      issues.push(`condition_unknown_intent:${intent.id}`);
    }
  }

  // —— one bounded repair ——
  let repaired = plan.intents.map((intent) => {
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
    if (
      intent.action === "CALENDAR" &&
      intent.condition &&
      !intent.needsFrom
    ) {
      next = {
        ...next,
        needsFrom: {
          intentId: intent.condition.intentId,
          fields: ["title", "date", "kickoff time", "location"],
        },
      };
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

  if (issues.includes("missing_condition")) {
    const conditional = heuristicConditionalCalendarPlan(opts.hydrate);
    if (conditional) {
      return { ok: false, issues, plan: conditional };
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

const INTERPRET_INSTRUCTIONS = buildInterpretInstructions("NORMAL");

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
  deliberationDepth: DeliberationDepth;
  planHealth: PlanHealth;
}> {
  const depth = classifyDeliberationDepth({
    userText: opts.hydrate.userText,
    hydrate: opts.hydrate,
  });
  const instructions = buildInterpretInstructions(depth);

  const finish = (
    ip: IntentPlan,
    meta: { raw?: string; usedHeuristic: boolean; repaired?: boolean },
  ) => {
    const checked = interpretSelfCheck({
      plan: ip,
      hydrate: opts.hydrate,
    });
    const planHealth = buildPlanHealth({
      depth,
      intentCount: checked.plan.intents.length,
      intents: checked.plan.intents,
      selfCheckIssues: checked.issues,
      repaired: Boolean(meta.repaired || checked.issues.length),
      usedHeuristic: meta.usedHeuristic,
    });
    return {
      plan: checked.plan,
      flatPlan: intentPlanToPlan(checked.plan),
      raw: meta.raw,
      usedHeuristic: meta.usedHeuristic,
      selfCheckIssues: checked.issues,
      deliberationDepth: depth,
      planHealth,
    };
  };

  if (opts.useHeuristicOnly || !opts.generate) {
    return finish(intentPlanFromHydrateHeuristic(opts.hydrate), {
      usedHeuristic: true,
    });
  }

  let raw = await opts.generate(opts.hydrate.planPrompt, instructions);
  let parsed = parseIntentPlanJson(raw);
  if (!parsed) {
    raw = await opts.generate(
      `${opts.hydrate.planPrompt}\n\nPrevious output was invalid JSON. Return only IntentPlan JSON. Defect: unparseable_output.`,
      instructions,
    );
    parsed = parseIntentPlanJson(raw);
  }
  if (!parsed) {
    return finish(intentPlanFromHydrateHeuristic(opts.hydrate), {
      raw,
      usedHeuristic: true,
    });
  }

  const firstCheck = interpretSelfCheck({
    plan: parsed,
    hydrate: opts.hydrate,
  });
  // One bounded repair: name exact defects; no open-ended self-chat loop
  if (!firstCheck.ok && firstCheck.issues.length) {
    const defectList = firstCheck.issues.slice(0, 8).join("; ");
    raw = await opts.generate(
      `${opts.hydrate.planPrompt}\n\nPrevious IntentPlan failed semantic validation.\nExact defects: ${defectList}\nReturn only repaired IntentPlan JSON. Do not include deliberation text.`,
      instructions,
    );
    const repaired = parseIntentPlanJson(raw);
    if (repaired) {
      return finish(repaired, {
        raw,
        usedHeuristic: false,
        repaired: true,
      });
    }
    return finish(firstCheck.plan, {
      raw,
      usedHeuristic: false,
      repaired: true,
    });
  }

  return finish(parsed, { raw, usedHeuristic: false });
}

export { INTERPRET_INSTRUCTIONS as PLAN_INSTRUCTIONS };
export {
  classifyDeliberationDepth,
  buildInterpretInstructions,
  type DeliberationDepth,
  type PlanHealth,
} from "./deliberation.ts";
