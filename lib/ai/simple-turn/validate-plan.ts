/**
 * Validate IntentPlan — semantic self-check + one bounded repair before RUN.
 */

import { browserRequiresWeb } from "./browser-policy.ts";
import { interpretSelfCheck } from "./plan.ts";
import { buildCanonicalLookupQuery, looksLikeNarrativeQuery } from "./query-normalize.ts";
import type {
  BrowserMode,
  HydrateResult,
  IntentPlan,
  Plan,
  PlanValidation,
} from "./types.ts";
import { intentPlanToPlan, normalizeIntentPlan, syncPlanAliases } from "./types.ts";

const FILLER_QUERY =
  /^(tell me about it|what it offers|what it's offering|write me a summary|look at it|about it)$/i;

export function validateIntentPlan(opts: {
  plan: IntentPlan;
  hydrate: HydrateResult;
  browser: BrowserMode;
}): PlanValidation {
  const issues: string[] = [];
  const plan = normalizeIntentPlan(opts.plan);

  if (!plan.overallIntent.trim()) issues.push("missing_intent");
  if (!plan.intents.length) issues.push("missing_asks");

  for (const intent of plan.intents) {
    if (intent.lookup && FILLER_QUERY.test(intent.lookup.q.trim())) {
      issues.push("filler_web_query");
    }
    if (intent.lookup && looksLikeNarrativeQuery(intent.lookup.q)) {
      issues.push(`narrative_query:${intent.id}`);
    }
    if (
      intent.action !== "ANSWER" &&
      intent.action !== "CALC" &&
      intent.action !== "CALENDAR" &&
      !intent.lookup?.q
    ) {
      issues.push(`missing_lookup:${intent.id}`);
    }
    if (
      intent.condition &&
      !plan.intents.some((i) => i.id === intent.condition!.intentId)
    ) {
      issues.push(`condition_unknown_intent:${intent.id}`);
    }
    if (
      intent.needsFrom &&
      !plan.intents.some((i) => i.id === intent.needsFrom!.intentId)
    ) {
      issues.push(`needsFrom_unknown_intent:${intent.id}`);
    }
  }

  for (const u of opts.hydrate.urls) {
    const bound = plan.intents.some(
      (i) =>
        i.entity?.toLowerCase().includes(u.domain) ||
        i.lookup?.q.toLowerCase().includes(u.domain) ||
        i.goal.toLowerCase().includes(u.domain),
    );
    if (!bound) issues.push(`url_unbound:${u.domain}`);
  }

  const flat = intentPlanToPlan(plan);
  if (
    flat.freshnessRequired &&
    plan.answer?.trim() &&
    !plan.intents.some((i) => i.action === "WEB")
  ) {
    issues.push("fresh_answer_without_retrieval");
  }

  if (
    browserRequiresWeb({
      browser: opts.browser,
      plan: flat,
      userText: opts.hydrate.userText,
    }) &&
    !plan.intents.some((i) => i.action === "WEB")
  ) {
    issues.push("browser_on_missing_web");
  }

  // Pronoun guessed while unresolved
  if (
    plan.intents.some((i) =>
      i.unresolvedRefs.some((r) => /pronoun|ambiguous/i.test(r)),
    ) &&
    plan.intents.some((i) => i.resolvedRefs.some((r) => /\bit\b.*=/i.test(r)))
  ) {
    // allowed if hydrate resolved — only flag hard guess with no hydrate support
    if (opts.hydrate.unresolved.some((u) => /ambiguous|pronoun/i.test(u))) {
      issues.push("pronoun_guessed_while_unresolved");
    }
  }

  if (!issues.length) return { ok: true, issues: [] };

  const repaired = repairIntentPlanCode({
    plan,
    hydrate: opts.hydrate,
    issues,
  });
  return { ok: false, issues, repaired };
}

export function repairIntentPlanCode(opts: {
  plan: IntentPlan;
  hydrate: HydrateResult;
  issues: string[];
}): IntentPlan {
  // Prefer interpretSelfCheck repair path
  const checked = interpretSelfCheck({
    plan: opts.plan,
    hydrate: opts.hydrate,
  });
  let plan = checked.plan;

  // Drop filler lookups
  plan = {
    ...plan,
    intents: plan.intents
      .map((intent) => {
        if (intent.lookup && FILLER_QUERY.test(intent.lookup.q.trim())) {
          return { ...intent, lookup: undefined };
        }
        if (intent.lookup && looksLikeNarrativeQuery(intent.lookup.q)) {
          return {
            ...intent,
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
        return intent;
      })
      .filter((intent) => {
        if (intent.action === "ANSWER" || intent.action === "CALC") return true;
        return Boolean(intent.lookup?.q);
      }),
  };

  for (const u of opts.hydrate.urls) {
    const has = plan.intents.some(
      (i) =>
        i.action === "WEB" &&
        (i.entity === u.domain || i.lookup?.q.includes(u.domain)),
    );
    if (!has) {
      plan.intents.push({
        id: String(plan.intents.length + 1),
        goal: `summarize what ${u.domain} offers`,
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

  if (
    opts.issues.includes("fresh_answer_without_retrieval") ||
    opts.issues.includes("browser_on_missing_web")
  ) {
    if (!plan.intents.some((i) => i.action === "WEB")) {
      plan.answer = undefined;
      plan.intents.push({
        id: String(plan.intents.length + 1),
        goal: opts.hydrate.userText.slice(0, 300),
        action: "WEB",
        entity: opts.hydrate.entityHints[0],
        constraints: [],
        resolvedRefs: opts.hydrate.resolved,
        unresolvedRefs: opts.hydrate.unresolved,
        freshnessRequired: true,
        dependsOn: [],
        lookup: {
          q: buildCanonicalLookupQuery({
            entity: opts.hydrate.entityHints[0],
            goal: opts.hydrate.userText.slice(0, 200),
            rawQ: opts.hydrate.topicHint
              ? `${opts.hydrate.topicHint} ${opts.hydrate.year}`
              : opts.hydrate.userText.slice(0, 160),
          }),
        },
      });
    }
  }

  return normalizeIntentPlan(plan);
}

/** Validate, one repair, re-validate. Never asks user to split questions. */
export function validateAndRepairPlan(opts: {
  plan: IntentPlan | Plan;
  hydrate: HydrateResult;
  browser: BrowserMode;
}): { plan: IntentPlan; flatPlan: Plan; issues: string[]; failed: boolean } {
  const asIntent: IntentPlan =
    "intents" in opts.plan && Array.isArray((opts.plan as IntentPlan).intents)
      ? (opts.plan as IntentPlan)
      : (() => {
          // Plan → IntentPlan via overall + lookups
          const p = syncPlanAliases(opts.plan as Plan);
          if (p.intentPlan) return p.intentPlan;
          return {
            overallIntent: p.intent,
            intents: (p.lookups.length
              ? p.lookups
              : [{ cap: "WEB" as const, q: p.intent }]
            ).map((l, i) => ({
              id: String(i + 1),
              goal: p.asks[i] ?? p.intent,
              action: (l.cap === "WEB" ||
              l.cap === "MEMORY" ||
              l.cap === "FILES" ||
              l.cap === "CALENDAR" ||
              l.cap === "EMAIL" ||
              l.cap === "CRM" ||
              l.cap === "CALC" ||
              l.cap === "BUILD"
                ? l.cap
                : "WEB") as IntentPlan["intents"][number]["action"],
              constraints: p.constraints,
              resolvedRefs: p.resolvedRefs,
              unresolvedRefs: p.unresolvedRefs,
              freshnessRequired: p.freshnessRequired,
              dependsOn: [],
              lookup: { q: l.q },
            })),
            answer: p.answer,
          };
        })();

  const first = validateIntentPlan({
    plan: asIntent,
    hydrate: opts.hydrate,
    browser: opts.browser,
  });
  if (first.ok) {
    const plan = normalizeIntentPlan(asIntent);
    return {
      plan,
      flatPlan: intentPlanToPlan(plan),
      issues: [],
      failed: false,
    };
  }

  const repaired =
    first.repaired ??
    repairIntentPlanCode({
      plan: asIntent,
      hydrate: opts.hydrate,
      issues: first.issues,
    });
  const second = validateIntentPlan({
    plan: repaired,
    hydrate: opts.hydrate,
    browser: opts.browser,
  });
  const hard = second.issues.filter(
    (i) =>
      i.startsWith("url_unbound") ||
      i === "filler_web_query" ||
      i === "fresh_answer_without_retrieval" ||
      i.startsWith("missing_lookup"),
  );
  const plan = normalizeIntentPlan(repaired);
  return {
    plan,
    flatPlan: intentPlanToPlan(plan),
    issues: first.issues,
    failed: hard.length > 0,
  };
}

/** @deprecated */
export function validatePlan(opts: {
  plan: Plan | IntentPlan;
  hydrate: HydrateResult;
  browser: BrowserMode;
}): { ok: boolean; issues: string[]; repaired?: Plan } {
  const result = validateAndRepairPlan(opts);
  return {
    ok: !result.failed && result.issues.length === 0,
    issues: result.issues,
    repaired: result.flatPlan,
  };
}

/** @deprecated */
export function repairPlanCode(opts: {
  plan: Plan | IntentPlan;
  hydrate: HydrateResult;
  issues: string[];
}): Plan {
  const asIntent =
    "intents" in opts.plan
      ? (opts.plan as IntentPlan)
      : validateAndRepairPlan({
          plan: opts.plan,
          hydrate: opts.hydrate,
          browser: "auto",
        }).plan;
  return intentPlanToPlan(
    repairIntentPlanCode({
      plan: asIntent,
      hydrate: opts.hydrate,
      issues: opts.issues,
    }),
  );
}
