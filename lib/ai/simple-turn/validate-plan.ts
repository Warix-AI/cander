/**
 * Validate PLAN — reject/repair before RUN.
 */

import { browserRequiresWeb } from "./browser-policy.ts";
import type { BrowserMode, HydrateResult, Plan, PlanValidation } from "./types.ts";

const FILLER_QUERY =
  /^(tell me about it|what it offers|what it's offering|write me a summary|look at it|about it)$/i;

function hasAskCoverage(userText: string, asks: string[]): boolean {
  if (!asks.length) return false;
  // Multi-ask: "and" / "?" often signal multiple parts
  const multi =
    (userText.match(/\?/g) ?? []).length >= 2 ||
    /\b.+\band\b.+\b(what|when|how|where|who)\b/i.test(userText);
  if (!multi) return asks.length >= 1;
  return asks.length >= 2 || asks.some((a) => a.length > 40);
}

export function validatePlan(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  browser: BrowserMode;
}): PlanValidation {
  const issues: string[] = [];
  const { plan, hydrate } = opts;

  if (!plan.intent.trim()) issues.push("missing_intent");
  if (!plan.asks.length) issues.push("missing_asks");

  if (!hasAskCoverage(hydrate.userText, plan.asks)) {
    issues.push("ask_coverage_gap");
  }

  // Explicit URL must bind to WEB lookup
  for (const u of hydrate.urls) {
    const bound = (plan.look ?? []).some(
      (l) =>
        l.cap === "WEB" &&
        (l.q.toLowerCase().includes(u.domain) ||
          l.q.toLowerCase().includes(u.url.toLowerCase())),
    );
    const inIntent =
      plan.intent.toLowerCase().includes(u.domain) ||
      plan.asks.some((a) => a.toLowerCase().includes(u.domain));
    if (!bound) issues.push(`url_unbound:${u.domain}`);
    if (!inIntent && !bound) issues.push(`url_dropped:${u.domain}`);
  }

  // Filler-only WEB queries
  for (const look of plan.look ?? []) {
    if (look.cap === "WEB" && FILLER_QUERY.test(look.q.trim())) {
      issues.push("filler_web_query");
    }
  }

  // Pronoun guessed while still unresolved
  if (
    plan.unresolvedRefs.some((r) => /pronoun|ambiguous/i.test(r)) &&
    plan.resolvedRefs.some((r) => /\bit\b.*=/i.test(r))
  ) {
    issues.push("pronoun_guessed_while_unresolved");
  }

  // fresh + factual answer without retrieval
  if (plan.fresh && plan.answer?.trim() && !(plan.look?.length)) {
    issues.push("fresh_answer_without_retrieval");
  }

  if (
    browserRequiresWeb({
      browser: opts.browser,
      plan,
      userText: hydrate.userText,
    }) &&
    !(plan.look ?? []).some((l) => l.cap === "WEB")
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
  const plan: Plan = {
    ...opts.plan,
    asks: [...opts.plan.asks],
    constraints: [...opts.plan.constraints],
    resolvedRefs: [...opts.plan.resolvedRefs],
    unresolvedRefs: [...opts.plan.unresolvedRefs],
    look: opts.plan.look ? [...opts.plan.look] : undefined,
  };

  // Drop filler lookups
  if (plan.look) {
    plan.look = plan.look.filter((l) => !FILLER_QUERY.test(l.q.trim()));
    if (!plan.look.length) plan.look = undefined;
  }

  // Bind missing URLs
  for (const u of opts.hydrate.urls) {
    const has = (plan.look ?? []).some(
      (l) => l.cap === "WEB" && l.q.toLowerCase().includes(u.domain),
    );
    if (!has) {
      plan.look = [...(plan.look ?? []), { cap: "WEB", q: u.url }];
      if (!plan.intent.toLowerCase().includes(u.domain)) {
        plan.intent = `inspect ${u.domain} and summarize what it offers`;
      }
      if (!plan.asks.some((a) => a.toLowerCase().includes(u.domain))) {
        plan.asks = [`Summarize ${u.domain}`];
      }
      if (!plan.resolvedRefs.some((r) => r.includes(u.domain))) {
        plan.resolvedRefs.push(`it = ${u.domain}`);
      }
    }
  }

  // fresh without look → add WEB
  if (
    (opts.issues.includes("fresh_answer_without_retrieval") ||
      opts.issues.includes("browser_on_missing_web")) &&
    !(plan.look ?? []).some((l) => l.cap === "WEB")
  ) {
    const q = opts.hydrate.topicHint
      ? `${opts.hydrate.userText} (${opts.hydrate.topicHint})`
      : opts.hydrate.userText;
    plan.look = [...(plan.look ?? []), { cap: "WEB", q: q.slice(0, 400) }];
    plan.answer = undefined;
  }

  if (opts.issues.includes("ask_coverage_gap") && plan.asks.length < 2) {
    const parts = opts.hydrate.userText
      .split(/\band\b|\?/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 8);
    if (parts.length >= 2) {
      plan.asks = parts.slice(0, 4).map((p) => p.slice(0, 300));
    }
  }

  return plan;
}

/** Validate, optionally take repaired plan, re-validate once. */
export function validateAndRepairPlan(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  browser: BrowserMode;
}): { plan: Plan; issues: string[]; failed: boolean } {
  const first = validatePlan(opts);
  if (first.ok) return { plan: opts.plan, issues: [], failed: false };

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
    return { plan: repaired, issues: first.issues, failed: false };
  }
  return { plan: repaired, issues: second.issues, failed: true };
}
