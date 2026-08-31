/**
 * Stage 9–10 — Execute request graph in waves.
 */

import type {
  Evidence,
  NormalizedRequest,
  RequestGraph,
  RequestResult,
  SourcePlan,
} from "../types.ts";
import { expandMapDependencies } from "../graph/expand-map.ts";
import type { ExecuteDeps } from "./deps.ts";
import { executeChatHistory } from "./providers/chat-history.ts";
import { executeContext } from "./providers/context.ts";
import { executeDeterministic } from "./providers/deterministic.ts";
import { executeKnowledgeBase } from "./providers/knowledge-base.ts";
import { executeMemory } from "./providers/memory.ts";
import { executeModel } from "./providers/model.ts";
import { executeWeb } from "./providers/web.ts";
import { verifyResult } from "../verify/check.ts";
import { refineOnMiss } from "../verify/miss-retry.ts";
import { resolveEvidenceConflict } from "../verify/conflict.ts";

export type { ExecuteDeps } from "./deps.ts";

export type ExecuteOutput = {
  results: RequestResult[];
  evidence: Evidence[];
  waves: string[][];
  normalized: NormalizedRequest[];
};

function depsSatisfied(
  n: NormalizedRequest,
  done: Map<string, RequestResult>,
): "ok" | "blocked" | "wait" {
  const deps = n.request.dependencies || [];
  if (!deps.length) return "ok";
  for (const d of deps) {
    const up = done.get(d.requestId);
    if (!up) return "wait";
    if (
      up.status === "unresolved" ||
      up.status === "blocked_upstream" ||
      up.status === "conflicting"
    ) {
      return "blocked";
    }
  }
  return "ok";
}

function isMapTemplate(n: NormalizedRequest): boolean {
  return Boolean(
    n.request.dependencies?.some((d) => d.type === "map") &&
      !n.request.qualifiers?.mapParent,
  );
}

async function runOne(
  n: NormalizedRequest,
  plan: SourcePlan,
  done: Map<string, RequestResult>,
  deps: ExecuteDeps,
): Promise<{ result: RequestResult; evidence: Evidence[] }> {
  if (deps.forceUnresolvedIds?.includes(n.request.id)) {
    return {
      result: {
        requestId: n.request.id,
        status: "unresolved",
        evidenceIds: [],
        reason: "forced_unresolved",
      },
      evidence: [],
    };
  }

  let out: { result: RequestResult; evidence: Evidence[] };

  switch (plan.strategy) {
    case "deterministic":
      out = await executeDeterministic(n, done);
      break;
    case "context":
      out = executeContext(n, deps.packet);
      break;
    case "memory":
      out = executeMemory(n, deps.packet);
      break;
    case "chat_history":
      out = executeChatHistory(n, deps.packet);
      break;
    case "knowledge_base":
      out = await executeKnowledgeBase(n, deps.packet, deps.fetchKb);
      break;
    case "web":
      out = await executeWeb(n, {
        fetchWeb: deps.fetchWeb,
        readUrl: deps.readUrl,
        allowStub: deps.allowWebStub,
      });
      break;
    case "model":
      out = await executeModel(n, deps.modelAnswer, done);
      break;
    case "hybrid": {
      const web = await executeWeb(n, {
        fetchWeb: deps.fetchWeb,
        allowStub: deps.allowWebStub,
      });
      if (web.result.status === "verified") {
        out = web;
      } else {
        out = await executeModel(n, deps.modelAnswer, done);
      }
      break;
    }
    default:
      out = await executeWeb(n, {
        fetchWeb: deps.fetchWeb,
        allowStub: deps.allowWebStub,
      });
  }

  out.result = verifyResult(n, out.result, out.evidence, plan);

  if (out.result.status === "unresolved") {
    const refined = await refineOnMiss(n, plan, deps, done);
    if (refined) out = refined;
  }

  const conflict = resolveEvidenceConflict(out.evidence, n.request.id);
  if (conflict.type === "conflicting") {
    out.result = {
      ...out.result,
      status: "conflicting",
      reason: conflict.reason,
    };
  } else if (conflict.type === "resolved") {
    out.result = {
      ...out.result,
      status: "verified",
      value: conflict.value,
      evidenceIds: [conflict.evidenceId],
      reason: conflict.reason,
    };
  }

  return out;
}

/** Resolve request_result / pronoun subjects from upstream values. */
function materializeSubject(
  n: NormalizedRequest,
  done: Map<string, RequestResult>,
): NormalizedRequest {
  const sub = n.request.subject;
  if (sub?.type === "request_result") {
    const up = done.get(sub.requestId);
    if (up?.status === "verified" || up?.status === "policy_trusted") {
      const name = String(up.value);
      return {
        ...n,
        request: {
          ...n.request,
          subject: { type: "named", value: name },
          qualifiers: {
            ...n.request.qualifiers,
            resolvedFrom: sub.requestId,
          },
        },
      };
    }
  }
  return n;
}

export async function executeGraph(args: {
  graph: RequestGraph;
  normalized: NormalizedRequest[];
  sourcePlans: SourcePlan[];
  deps: ExecuteDeps;
}): Promise<ExecuteOutput> {
  let normalized = [...args.normalized];
  const planById = new Map<string, SourcePlan>();
  for (let i = 0; i < args.normalized.length; i++) {
    planById.set(args.normalized[i]!.request.id, args.sourcePlans[i]!);
  }

  const done = new Map<string, RequestResult>();
  const allEvidence: Evidence[] = [];
  const waves: string[][] = [];
  let guard = 0;

  while (guard++ < 40) {
    const expanded = expandMapDependencies({ normalized, results: done });

    for (const e of expanded) {
      if (!planById.has(e.request.id)) {
        planById.set(e.request.id, {
          strategy: "web",
          reason: "map_expand",
          matchedPolicy: false,
        });
      }
    }

    // Drop map templates that have been expanded into children
    normalized = expanded.filter((n) => {
      if (!isMapTemplate(n)) return true;
      const mapDep = n.request.dependencies?.find((d) => d.type === "map");
      if (!mapDep) return true;
      const parent = done.get(mapDep.requestId);
      if (parent?.status === "verified" && Array.isArray(parent.value)) {
        const hasChildren = expanded.some(
          (c) => c.request.qualifiers?.mapParent === n.request.id,
        );
        return !hasChildren;
      }
      return true;
    });

    for (const e of expanded) {
      if (
        e.request.qualifiers?.mapParent &&
        !normalized.find((n) => n.request.id === e.request.id)
      ) {
        normalized.push(e);
      }
    }

    const pending = normalized.filter((n) => !done.has(n.request.id));
    if (!pending.length) break;

    // Mark blocked map templates; never execute templates directly
    for (const n of pending.filter(isMapTemplate)) {
      const mapDep = n.request.dependencies?.find((d) => d.type === "map");
      if (!mapDep) continue;
      const parent = done.get(mapDep.requestId);
      if (
        parent &&
        (parent.status === "unresolved" ||
          parent.status === "blocked_upstream" ||
          parent.status === "conflicting")
      ) {
        done.set(n.request.id, {
          requestId: n.request.id,
          status: "blocked_upstream",
          evidenceIds: [],
          reason: "upstream_failed",
        });
      }
    }

    const executable = pending.filter((n) => !isMapTemplate(n));
    const ready: NormalizedRequest[] = [];
    for (const n of executable) {
      const sat = depsSatisfied(n, done);
      if (sat === "blocked") {
        done.set(n.request.id, {
          requestId: n.request.id,
          status: "blocked_upstream",
          evidenceIds: [],
          reason: "upstream_failed",
        });
      } else if (sat === "ok") {
        ready.push(n);
      }
    }

    if (!ready.length) {
      const waitingOnParent = pending.some((n) => {
        if (done.has(n.request.id)) return false;
        if (isMapTemplate(n)) {
          const mapDep = n.request.dependencies?.find((d) => d.type === "map");
          return Boolean(mapDep && !done.has(mapDep.requestId));
        }
        return depsSatisfied(n, done) === "wait";
      });
      if (waitingOnParent) continue;

      // Map template present but parent done — next expand should create children
      const templatesLeft = pending.filter(
        (n) => isMapTemplate(n) && !done.has(n.request.id),
      );
      if (templatesLeft.length) {
        let canExpand = false;
        for (const t of templatesLeft) {
          const mapDep = t.request.dependencies?.find((d) => d.type === "map");
          if (mapDep && done.get(mapDep.requestId)?.status === "verified") {
            canExpand = true;
          }
        }
        if (canExpand) continue;
      }

      for (const n of pending) {
        if (!done.has(n.request.id)) {
          done.set(n.request.id, {
            requestId: n.request.id,
            status: "unresolved",
            evidenceIds: [],
            reason: "not_ready",
          });
        }
      }
      break;
    }

    waves.push(ready.map((r) => r.request.id));
    await Promise.all(
      ready.map(async (n) => {
        const materialized = materializeSubject(n, done);
        const plan = planById.get(n.request.id) || {
          strategy: "web" as const,
          reason: "fallback",
          matchedPolicy: false,
        };
        const out = await runOne(materialized, plan, done, args.deps);
        done.set(n.request.id, out.result);
        allEvidence.push(...out.evidence);
      }),
    );
  }

  return {
    results: [...done.values()],
    evidence: allEvidence,
    waves,
    normalized,
  };
}
