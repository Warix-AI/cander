/**
 * RUN — execute IntentPlan by dependency waves (independent intents in parallel).
 */

import type { AiToolCallResult } from "../runtime/tools.ts";
import { filterLookupsByBrowser } from "./browser-policy.ts";
import { executeLookup } from "./cap-router.ts";
import { buildCanonicalLookupQuery } from "./query-normalize.ts";
import type {
  BrowserMode,
  Intent,
  IntentPlan,
  IntentResult,
  Lookup,
  Plan,
  SimpleEvidence,
} from "./types.ts";
import { actionToCap, intentPlanToPlan } from "./types.ts";

function intentToLookup(intent: Intent): Lookup | null {
  const cap = actionToCap(intent.action);
  if (!cap) return null;
  const q =
    intent.lookup?.q ||
    buildCanonicalLookupQuery({
      entity: intent.entity,
      subject: intent.subject,
      goal: intent.goal,
      quantity: intent.quantity,
    });
  if (!q) return null;
  return {
    cap,
    q,
    parallelGroup: intent.dependsOn.length ? `dep_${intent.id}` : "parallel",
    intentId: intent.id,
  };
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
      if (intent.dependsOn.every((d) => done.has(d))) {
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
    const runnable = wave.filter((intent) => {
      if (intent.action === "ANSWER") {
        intentResults.push({
          intent,
          status: "succeeded",
          evidence: [],
          accepted: [],
        });
        succeededIds.add(intent.id);
        return false;
      }
      // Skip if dependency failed
      if (
        intent.dependsOn.some(
          (d) =>
            !succeededIds.has(d) &&
            intentResults.some((r) => r.intent.id === d && r.status !== "succeeded"),
        )
      ) {
        const depFailed = intent.dependsOn.some((d) =>
          intentResults.some(
            (r) =>
              r.intent.id === d &&
              (r.status === "failed" || r.status === "unresolved"),
          ),
        );
        if (depFailed) {
          intentResults.push({
            intent,
            status: "skipped",
            evidence: [],
            accepted: [],
            rejectReason: "upstream_intent_failed",
          });
          return false;
        }
      }
      return true;
    });

    const lookups = runnable
      .map(intentToLookup)
      .filter((l): l is Lookup => l != null);

    // Merge extra refine lookups targeting same intents
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
        return { lookup, ev: { ...ev, intentId: lookup.intentId ?? ev.intentId } };
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
      const ok = related.some((e) => e.ok && e.content.trim().length >= 8);
      // CALC can succeed from prior evidence without a strong tool result
      if (intent.action === "CALC") {
        intentResults.push({
          intent,
          status: "succeeded",
          evidence: related,
          accepted: related.filter((e) => e.ok),
        });
        succeededIds.add(intent.id);
        continue;
      }
      if (ok) {
        intentResults.push({
          intent,
          status: "succeeded",
          evidence: related,
          accepted: related.filter((e) => e.ok),
        });
        succeededIds.add(intent.id);
      } else {
        intentResults.push({
          intent,
          status: "failed",
          evidence: related,
          accepted: [],
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
