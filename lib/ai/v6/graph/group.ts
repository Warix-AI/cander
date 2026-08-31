/**
 * Group compatible retrievals (same subject + source + freshness).
 */

import type { NormalizedRequest, SourcePlan } from "../types.ts";

export type RetrievalGroup = {
  groupId: string;
  requestIds: string[];
  strategy: SourcePlan["strategy"];
  subjectKey: string;
};

function subjectKey(n: NormalizedRequest): string {
  const s = n.request.subject;
  if (!s) return "";
  if (s.type === "named") return s.value.toLowerCase();
  if (s.type === "context") return s.ref.toLowerCase();
  return s.requestId;
}

export function groupCompatibleRequests(
  normalized: NormalizedRequest[],
  plans: SourcePlan[],
): RetrievalGroup[] {
  const map = new Map<string, RetrievalGroup>();
  for (let i = 0; i < normalized.length; i++) {
    const n = normalized[i]!;
    const plan = plans[i]!;
    if (n.request.kind === "calculate" || n.request.dependencies?.some((d) => d.type === "map")) {
      map.set(n.request.id, {
        groupId: n.request.id,
        requestIds: [n.request.id],
        strategy: plan.strategy,
        subjectKey: subjectKey(n),
      });
      continue;
    }
    const key = `${subjectKey(n)}|${plan.strategy}|${plan.policyKey || "none"}`;
    const existing = map.get(key);
    if (existing) {
      existing.requestIds.push(n.request.id);
    } else {
      map.set(key, {
        groupId: key,
        requestIds: [n.request.id],
        strategy: plan.strategy,
        subjectKey: subjectKey(n),
      });
    }
  }
  return [...map.values()];
}
