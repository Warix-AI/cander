import type {
  ContextPacket,
  Evidence,
  NormalizedRequest,
  RequestResult,
} from "../../types.ts";

export function executeMemory(
  n: NormalizedRequest,
  packet: ContextPacket,
): { result: RequestResult; evidence: Evidence[] } {
  const q = [
    n.request.subject?.type === "named" ? n.request.subject.value : "",
    n.property.raw || "",
  ]
    .join(" ")
    .toLowerCase();

  const hit = packet.relevantMemories.find((m) =>
    m.text.toLowerCase().includes(q.slice(0, 20)) || q.includes(m.text.slice(0, 12).toLowerCase()),
  ) || packet.relevantMemories[0];

  if (!hit) {
    return {
      result: {
        requestId: n.request.id,
        status: "unresolved",
        evidenceIds: [],
        reason: "no_memory",
      },
      evidence: [],
    };
  }

  const id = `ev_mem_${n.request.id}`;
  return {
    result: {
      requestId: n.request.id,
      status: "verified",
      value: hit.text,
      evidenceIds: [id],
    },
    evidence: [
      {
        id,
        sourceType: "memory",
        excerpt: hit.text,
        value: hit.text,
        scores: {
          [n.request.id]: {
            subjectMatch: 0.8,
            propertyMatch: 0.7,
            relevance: hit.score ?? 0.7,
            authority: 80,
            freshnessValid: true,
          },
        },
      },
    ],
  };
}
