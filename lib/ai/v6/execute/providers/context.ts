import type { ContextPacket, Evidence, NormalizedRequest, RequestResult } from "../../types.ts";

export function executeContext(
  n: NormalizedRequest,
  packet: ContextPacket,
): { result: RequestResult; evidence: Evidence[] } {
  const subj =
    n.request.subject?.type === "named" ? n.request.subject.value : "";
  const hit = packet.activeEntities.find(
    (e) => e.name.toLowerCase() === subj.toLowerCase(),
  );
  if (hit) {
    const id = `ev_ctx_${n.request.id}`;
    return {
      result: {
        requestId: n.request.id,
        status: "verified",
        value: hit.name,
        evidenceIds: [id],
      },
      evidence: [
        {
          id,
          sourceType: "context",
          value: hit,
          excerpt: hit.name,
          scores: {
            [n.request.id]: {
              subjectMatch: 1,
              propertyMatch: 0.5,
              relevance: 0.8,
              authority: 70,
              freshnessValid: true,
            },
          },
        },
      ],
    };
  }
  return {
    result: {
      requestId: n.request.id,
      status: "unresolved",
      evidenceIds: [],
      reason: "no_context_hit",
    },
    evidence: [],
  };
}
