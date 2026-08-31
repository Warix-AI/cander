/**
 * Stage 8 — Request graph after normalization + policy.
 */

import type {
  Dependency,
  ExecutionNode,
  NormalizedRequest,
  RequestGraph,
  SourcePlan,
} from "../types.ts";
import { planSource } from "../normalize/policies.ts";

export function buildRequestGraph(
  normalized: NormalizedRequest[],
): { graph: RequestGraph; sourcePlans: SourcePlan[] } {
  const sourcePlans: SourcePlan[] = [];
  const nodes: ExecutionNode[] = normalized.map((n) => {
    const sourcePlan = planSource(n);
    sourcePlans.push(sourcePlan);
    return {
      requestId: n.request.id,
      sourcePlan,
      dependencies: n.request.dependencies ?? [],
      executionState: (n.request.dependencies?.length ? "pending" : "ready") as ExecutionNode["executionState"],
    };
  });
  return { graph: { nodes }, sourcePlans };
}
