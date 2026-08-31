/**
 * Validate INTERPRET plan — reject/repair before RUN.
 */

import { browserRequiresWeb } from "./browser-policy.ts";
import type { BrowserMode, HydrateResult, Plan, PlanValidation } from "./types.ts";
import { syncPlanAliases } from "./types.ts";

const FILLER_QUERY =
  /^(tell me about it|what it offers|what it's offering|write me a summary|look at it|about it)$/i;

function hasAskCoverage(userText: string, asks: string[]): boolean {
  if (!asks.length) return false;
  const multi =
    (userText.match(/\?/g) ?? []).length >= 2 ||
    /\b.+\band\b.+\b(what|when|how|where|who)\b/i.test(userText);
  if (!multi) return asks.length >= 1;
  return asks.length >= 2 || asks.some((a) => a.length > 40);
}

function lookupsOf(plan: Plan) {
  return plan.lookups?.length ? plan.lookups : plan.look ?? [];
}

export function validatePlan(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  browser: BrowserMode;
}): PlanValidation {
  const issues: string[] = [];
  const plan = syncPlanAliases(opts.plan);
  const { hydrate } = opts;

  if (!plan.intent.trim()) issues.push("missing_intent");
  if (!plan.asks.length) issues.push("missing_asks");

  if (!hasAskCoverage(hydrate.userText, plan.asks)) {
    issues.push("ask_coverage_gap");
  }

  for (const u of hydrate.urls) {
    const bound = lookupsOf(plan).some(
      (l) =>
        l.cap === "WEB" &&
        (l.q.toLowerCase().includes(u.domain) ||
          l.q.toLowerCase().includes(u.url.toLowerCase())),
    );
    const inIntent =
      plan.intent.toLowerCase().includes(u.domain) ||
      plan.asks.some((a) => a.toLowerCase().includes(u.domain)) ||
      plan.entities.some((e) => e.toLowerCase().includes(u.domain));
    if (!bound) issues.push(`url_unbound:${u.domain}`);
    if (!inIntent && !bound) issues.push(`url_dropped:${u.domain}`);
  }

  for (const look of lookupsOf(plan)) {
    if (look.cap === "WEB" && FILLER_QUERY.test(look.q.trim())) {
      issues.push("filler_web_query");
    }
  }

  if (
    plan.unresolvedRefs.some((r) => /pronoun|ambiguous/i.test(r)) &&
    plan.resolvedRefs.some((r) => /\bit\b.*=/i.test(r))
  ) {
    issues.push("pronoun_guessed_while_unresolved");
  }

  if (
    plan.freshnessRequired &&
    plan.answer?.trim() &&
    !lookupsOf(plan).length
  ) {
    issues.push("fresh_answer_without_retrieval");
  }

  if (
    browserRequiresWeb({
      browser: opts.browser,
      plan,
      userText: hydrate.userText,
    }) &&
    !lookupsOf(plan).some((l) => l.cap === "WEB")
  ) {
    issues.push("browser_on_missing_web");
  }

  if (!issues.length) return { ok: true, issues: [] };

  const repaired = repairPlanCode({ plan, hydrate, issues });
  return {
    ok: false,
    issues,
    repaired,
  };
}

/** One bounded code repair — not an agent loop. */
export function repairPlanCode(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  issues: string[];
}): Plan {
  let plan = syncPlanAliases({
    ...opts.plan,
    asks: [...opts.plan.asks],
    constraints: [...(opts.plan.constraints ?? [])],
    entities: [...(opts.plan.entities ?? [])],
    resolvedRefs: [...opts.plan.resolvedRefs],
    unresolvedRefs: [...opts.plan.unresolvedRefs],
    temporalContext: [...(opts.plan.temporalContext ?? [])],
    expectedEvidence: [...(opts.plan.expectedEvidence ?? [])],
    lookups: [...lookupsOf(opts.plan)],
  });

  plan.lookups = plan.lookups.filter((l) => !FILLER_QUERY.test(l.q.trim()));

  for (const u of opts.hydrate.urls) {
    const has = plan.lookups.some(
      (l) => l.cap === "WEB" && l.q.toLowerCase().includes(u.domain),
    );
    if (!has) {
      plan.lookups = [
        ...plan.lookups,
        { cap: "WEB", q: u.url, parallelGroup: "url" },
      ];
      if (!plan.intent.toLowerCase().includes(u.domain)) {
        plan.intent = `inspect ${u.domain} and summarize what it offers`;
      }
      if (!plan.asks.some((a) => a.toLowerCase().includes(u.domain))) {
        plan.asks = [`Summarize ${u.domain}`];
      }
      if (!plan.entities.some((e) => e.toLowerCase().includes(u.domain))) {
        plan.entities.push(u.domain);
      }
      if (!plan.resolvedRefs.some((r) => r.includes(u.domain))) {
        plan.resolvedRefs.push(`it = ${u.domain}`);
      }
      if (!plan.expectedEvidence.length) {
        plan.expectedEvidence = [`Readable page content from ${u.domain}`];
      }
      plan.answerShape = plan.answerShape ?? "summary";
    }
  }

  if (
    (opts.issues.includes("fresh_answer_without_retrieval") ||
      opts.issues.includes("browser_on_missing_web")) &&
    !plan.lookups.some((l) => l.cap === "WEB")
  ) {
    const q = opts.hydrate.topicHint
      ? `${opts.hydrate.userText} (${opts.hydrate.topicHint})`
      : opts.hydrate.userText;
    plan.lookups = [
      ...plan.lookups,
      { cap: "WEB", q: q.slice(0, 400), parallelGroup: "primary" },
    ];
    plan.answer = undefined;
    plan.freshnessRequired = true;
  }

  if (opts.issues.includes("ask_coverage_gap") && plan.asks.length < 2) {
    const parts = opts.hydrate.userText
      .split(/\band\b|\?/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 8);
    if (parts.length >= 2) {
      plan.asks = parts.slice(0, 4).map((p) => p.slice(0, 300));
      plan.answerShape = "mixed";
    }
  }

  return syncPlanAliases(plan);
}

/** Validate, optionally take repaired plan, re-validate once. */
export function validateAndRepairPlan(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  browser: BrowserMode;
}): { plan: Plan; issues: string[]; failed: boolean } {
  const first = validatePlan(opts);
  if (first.ok) {
    return { plan: syncPlanAliases(opts.plan), issues: [], failed: false };
  }

  const repaired =
    first.repaired ??
    repairPlanCode({
      plan: opts.plan,
      hydrate: opts.hydrate,
      issues: first.issues,
    });
  const second = validatePlan({
    plan: repaired,
    hydrate: opts.hydrate,
    browser: opts.browser,
  });
  const hard = second.issues.filter(
    (i) =>
      i.startsWith("url_unbound") ||
      i === "filler_web_query" ||
      i === "fresh_answer_without_retrieval",
  );
  if (!hard.length) {
    return {
      plan: syncPlanAliases(repaired),
      issues: first.issues,
      failed: false,
    };
  }
  return {
    plan: syncPlanAliases(repaired),
    issues: second.issues,
    failed: true,
  };
}
