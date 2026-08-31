/**
 * Miss retry — one refinement round.
 */

import type {
  Evidence,
  NormalizedRequest,
  RequestResult,
  SourcePlan,
} from "../types.ts";
import type { ExecuteDeps } from "../execute/deps.ts";
import { executeWeb } from "../execute/providers/web.ts";
import { executeKnowledgeBase } from "../execute/providers/knowledge-base.ts";
import { verifyResult } from "./check.ts";

export async function refineOnMiss(
  n: NormalizedRequest,
  plan: SourcePlan,
  deps: ExecuteDeps,
  _done: Map<string, RequestResult>,
): Promise<{ result: RequestResult; evidence: Evidence[] } | null> {
  const subject =
    n.request.subject?.type === "named" ? n.request.subject.value : "";
  const broadened = `${subject} ${n.property.canonicalKey || n.property.raw || ""} official`;

  if (plan.strategy === "web" || plan.strategy === "hybrid") {
    const out = await executeWeb(
      {
        ...n,
        request: {
          ...n.request,
          property: n.property.canonicalKey || n.property.raw,
          qualifiers: { ...n.request.qualifiers, refinedQuery: broadened },
        },
      },
      { fetchWeb: deps.fetchWeb },
    );
    out.result = verifyResult(n, out.result, out.evidence, plan);
    if (out.result.status === "verified") return out;
  }

  if (plan.strategy === "knowledge_base") {
    const out = await executeKnowledgeBase(n, deps.packet, deps.fetchKb);
    out.result = verifyResult(n, out.result, out.evidence, plan);
    if (out.result.status === "verified") return out;
    // Alternate: try web for external facts
    const web = await executeWeb(n, { fetchWeb: deps.fetchWeb });
    web.result = verifyResult(
      n,
      web.result,
      web.evidence,
      { ...plan, strategy: "web" },
    );
    if (web.result.status === "verified") return web;
  }

  return null;
}
