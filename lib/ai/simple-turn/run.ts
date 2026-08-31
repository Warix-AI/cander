/**
 * RUN — execute IntentPlan by dependency waves (independent intents in parallel).
 * Conditions and needsFrom are evaluated in code — not by the model.
 */

import type { AiToolCallResult } from "../runtime/tools.ts";
import { filterLookupsByBrowser } from "./browser-policy.ts";
import { executeLookup } from "./cap-router.ts";
import { buildCanonicalLookupQuery } from "./query-normalize.ts";
import type {
  BrowserMode,
  Intent,
  IntentCondition,
  IntentPlan,
  IntentResult,
  Lookup,
  Plan,
  SimpleEvidence,
} from "./types.ts";
import { actionToCap, intentPlanToPlan } from "./types.ts";

function intentToLookup(
  intent: Intent,
  needsPayload?: Record<string, string>,
): Lookup | null {
  const cap = actionToCap(intent.action);
  if (!cap) return null;

  let q =
    intent.lookup?.q ||
    buildCanonicalLookupQuery({
      entity: intent.entity,
      subject: intent.subject,
      goal: intent.goal,
      quantity: intent.quantity,
    });

  // Inject structured fields from upstream into write/dependent lookups
  if (needsPayload && Object.keys(needsPayload).length) {
    const fieldLine = Object.entries(needsPayload)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    if (intent.action === "CALENDAR" || intent.action === "EMAIL") {
      q = `${q} | ${fieldLine}`.slice(0, 400);
    }
  }

  if (!q) return null;
  return {
    cap,
    q,
    parallelGroup: intent.dependsOn.length ? `dep_${intent.id}` : "parallel",
    intentId: intent.id,
  };
}

/** Implicit deps: dependsOn ∪ condition.intentId ∪ needsFrom.intentId */
export function effectiveDependsOn(intent: Intent): string[] {
  const ids = [
    ...intent.dependsOn,
    ...(intent.condition ? [intent.condition.intentId] : []),
    ...(intent.needsFrom ? [intent.needsFrom.intentId] : []),
  ];
  return ids.filter((v, i, a) => a.indexOf(v) === i);
}

/** Topological waves: intents with satisfied deps each round. */
export function intentExecutionWaves(intents: Intent[]): Intent[][] {
  const remaining = new Map(intents.map((i) => [i.id, i]));
  const done = new Set<string>();
  const waves: Intent[][] = [];
  let guard = 0;
  while (remaining.size && guard++ < 20) {
    const ready: Intent[] = [];
    for (const intent of remaining.values()) {
      if (effectiveDependsOn(intent).every((d) => done.has(d))) {
        ready.push(intent);
      }
    }
    if (!ready.length) {
      // Break cycles: run remaining without deps enforcement
      waves.push([...remaining.values()]);
      break;
    }
    waves.push(ready);
    for (const intent of ready) {
      remaining.delete(intent.id);
      done.add(intent.id);
    }
  }
  return waves;
}

function upstreamResult(
  intentResults: IntentResult[],
  intentId: string,
): IntentResult | undefined {
  return intentResults.find((r) => r.intent.id === intentId);
}

/** Evaluate Intent.condition against completed upstream results (code-owned). */
export function evaluateIntentCondition(
  condition: IntentCondition,
  intentResults: IntentResult[],
): boolean {
  const up = upstreamResult(intentResults, condition.intentId);
  if (!up) return false;

  const blob = [
    ...up.accepted.map((e) => e.content),
    ...up.evidence.map((e) => e.content),
  ]
    .join("\n")
    .toLowerCase();

  switch (condition.operator) {
    case "exists":
      return (
        up.status === "succeeded" &&
        (up.accepted.length > 0 ||
          up.evidence.some((e) => e.ok && e.content.trim().length >= 8))
      );
    case "equals": {
      if (up.status !== "succeeded") return false;
      const want = (condition.value ?? "").trim().toLowerCase();
      if (!want) return Boolean(blob.trim());
      return blob.includes(want) || blob.trim() === want;
    }
    case "not_equals": {
      if (up.status !== "succeeded") return true;
      const want = (condition.value ?? "").trim().toLowerCase();
      if (!want) return !blob.trim();
      return !blob.includes(want);
    }
    default:
      return false;
  }
}

/**
 * Pull named fields from upstream evidence text (lightweight, deterministic).
 * Not free-form reasoning — pattern hints only for needsFrom wiring.
 */
export function extractNeedsPayload(
  intent: Intent,
  intentResults: IntentResult[],
): Record<string, string> {
  if (!intent.needsFrom) return {};
  const up = upstreamResult(intentResults, intent.needsFrom.intentId);
  if (!up) return {};
  const text = [...up.accepted, ...up.evidence]
    .map((e) => e.content)
    .join("\n");
  const out: Record<string, string> = {};

  for (const field of intent.needsFrom.fields) {
    const key = field.toLowerCase();
    let value = "";
    if (/title|event|matchup|game/.test(key)) {
      value =
        text.match(
          /\b([A-Z][A-Za-z.&']+(?:\s+[A-Z][A-Za-z.&']+){0,4}\s+vs\.?\s+[A-Z][A-Za-z.&']+(?:\s+[A-Z][A-Za-z.&']+){0,4})/,
        )?.[1] ??
        intent.entity ??
        "";
    } else if (/date|day/.test(key)) {
      value =
        text.match(
          /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        )?.[1] ?? "";
    } else if (/time|kickoff/.test(key)) {
      value =
        text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\s*(?:AM|PM))/i)?.[1] ??
        "";
    } else if (/location|venue|stadium|arena/.test(key)) {
      value =
        text.match(
          /\b(?:at|@)\s+([A-Z][A-Za-z0-9 .'-]{2,40}(?:Stadium|Arena|Field|Dome|Center)?)/,
        )?.[1] ?? "";
    }
    if (value) out[field] = value.trim().slice(0, 200);
  }
  return out;
}

function depsBlocked(
  intent: Intent,
  intentResults: IntentResult[],
  succeededIds: Set<string>,
): boolean {
  return effectiveDependsOn(intent).some((d) => {
    if (succeededIds.has(d)) return false;
    return intentResults.some(
      (r) =>
        r.intent.id === d &&
        (r.status === "failed" ||
          r.status === "unresolved" ||
          r.status === "BLOCKED_UPSTREAM_FAILED" ||
          r.status === "SKIPPED_BY_CONDITION"),
    );
  });
}

export async function runLookups(opts: {
  plan: Plan | IntentPlan;
  browser: BrowserMode;
  userText: string;
  cache: Map<string, SimpleEvidence>;
  executeTool?: (opts: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<AiToolCallResult>;
  extraLookups?: Lookup[];
  /** When set, only run these intent ids (retry path). */
  onlyIntentIds?: string[];
}): Promise<{
  evidence: SimpleEvidence[];
  lookupsRun: Lookup[];
  blocked: Lookup[];
  intentResults: IntentResult[];
}> {
  const intentPlan: IntentPlan | null =
    "intents" in opts.plan && Array.isArray((opts.plan as IntentPlan).intents)
      ? (opts.plan as IntentPlan)
      : (opts.plan as Plan).intentPlan ?? null;

  if (!intentPlan) {
    // Legacy flat lookups
    const flat = opts.plan as Plan;
    const requested = [
      ...(flat.lookups?.length ? flat.lookups : flat.look ?? []),
      ...(opts.extraLookups ?? []),
    ];
    const allowed = filterLookupsByBrowser(
      requested,
      opts.browser,
      opts.userText,
    );
    const blocked = requested.filter(
      (l) => !allowed.some((a) => a.cap === l.cap && a.q === l.q),
    );
    const evidence = await Promise.all(
      allowed.map((lookup) =>
        executeLookup({
          lookup,
          cache: opts.cache,
          executeTool: opts.executeTool,
        }),
      ),
    );
    return {
      evidence,
      lookupsRun: allowed,
      blocked,
      intentResults: [],
    };
  }

  const intents = intentPlan.intents.filter((i) =>
    opts.onlyIntentIds ? opts.onlyIntentIds.includes(i.id) : true,
  );
  const waves = intentExecutionWaves(intents);
  const allEvidence: SimpleEvidence[] = [];
  const lookupsRun: Lookup[] = [];
  const blocked: Lookup[] = [];
  const intentResults: IntentResult[] = [];
  const succeededIds = new Set<string>();

  for (const wave of waves) {
    const runnable: Intent[] = [];
    const needsByIntent = new Map<string, Record<string, string>>();

    for (const intent of wave) {
      if (intent.action === "ANSWER") {
        intentResults.push({
          intent,
          status: "succeeded",
          evidence: [],
          accepted: [],
        });
        succeededIds.add(intent.id);
        continue;
      }

      if (depsBlocked(intent, intentResults, succeededIds)) {
        intentResults.push({
          intent,
          status: "BLOCKED_UPSTREAM_FAILED",
          evidence: [],
          accepted: [],
          rejectReason: "BLOCKED_UPSTREAM_FAILED",
        });
        continue;
      }

      // Condition gate (after deps succeed)
      if (intent.condition) {
        const pass = evaluateIntentCondition(intent.condition, intentResults);
        if (!pass) {
          intentResults.push({
            intent,
            status: "SKIPPED_BY_CONDITION",
            evidence: [],
            accepted: [],
            rejectReason: "SKIPPED_BY_CONDITION",
          });
          continue;
        }
      }

      const needsPayload = extractNeedsPayload(intent, intentResults);
      if (Object.keys(needsPayload).length) {
        needsByIntent.set(intent.id, needsPayload);
      }
      runnable.push(intent);
    }

    const lookups = runnable
      .map((intent) =>
        intentToLookup(intent, needsByIntent.get(intent.id)),
      )
      .filter((l): l is Lookup => l != null);

    for (const extra of opts.extraLookups ?? []) {
      if (
        !lookups.some((l) => l.q === extra.q && l.cap === extra.cap) &&
        (!opts.onlyIntentIds ||
          (extra.intentId && opts.onlyIntentIds.includes(extra.intentId)))
      ) {
        lookups.push(extra);
      }
    }

    const allowed = filterLookupsByBrowser(
      lookups,
      opts.browser,
      opts.userText,
    );
    for (const l of lookups) {
      if (!allowed.some((a) => a.cap === l.cap && a.q === l.q)) blocked.push(l);
    }

    const batch = await Promise.all(
      allowed.map(async (lookup) => {
        const ev = await executeLookup({
          lookup,
          cache: opts.cache,
          executeTool: opts.executeTool,
        });
        return {
          lookup,
          ev: { ...ev, intentId: lookup.intentId ?? ev.intentId },
        };
      }),
    );

    for (const { lookup, ev } of batch) {
      lookupsRun.push(lookup);
      allEvidence.push(ev);
    }

    for (const intent of runnable) {
      const related = batch
        .filter((b) => b.lookup.intentId === intent.id)
        .map((b) => b.ev);
      const needsPayload = needsByIntent.get(intent.id);
      const ok = related.some((e) => e.ok && e.content.trim().length >= 8);

      // CALC / CALENDAR with needsFrom may succeed from upstream payload
      if (intent.action === "CALC") {
        intentResults.push({
          intent,
          status: "succeeded",
          evidence: related,
          accepted: related.filter((e) => e.ok),
          needsPayload,
        });
        succeededIds.add(intent.id);
        continue;
      }

      if (intent.action === "CALENDAR") {
        // Writes require confirmation/safety — mark succeeded only when
        // required needsFrom fields are present; actual write is deferred.
        const required = intent.needsFrom?.fields ?? [];
        const hasNeeds =
          !required.length ||
          required.some((f) => needsPayload?.[f]) ||
          ok;
        if (hasNeeds) {
          intentResults.push({
            intent,
            status: "succeeded",
            evidence: related,
            accepted: related.filter((e) => e.ok),
            needsPayload,
            rejectReason: "calendar_pending_confirmation",
          });
          succeededIds.add(intent.id);
        } else {
          intentResults.push({
            intent,
            status: "failed",
            evidence: related,
            accepted: [],
            needsPayload,
            rejectReason: "calendar_missing_fields",
          });
        }
        continue;
      }

      if (ok) {
        intentResults.push({
          intent,
          status: "succeeded",
          evidence: related,
          accepted: related.filter((e) => e.ok),
          needsPayload,
        });
        succeededIds.add(intent.id);
      } else {
        intentResults.push({
          intent,
          status: "failed",
          evidence: related,
          accepted: [],
          needsPayload,
          rejectReason: related[0]?.rejectReason ?? "lookup_failed",
        });
      }
    }
  }

  return {
    evidence: allEvidence,
    lookupsRun,
    blocked,
    intentResults,
  };
}

export function planForRun(plan: IntentPlan | Plan): Plan {
  if ("intents" in plan) return intentPlanToPlan(plan);
  return plan;
}
