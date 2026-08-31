import type {
  ContextPacket,
  Evidence,
  NormalizedRequest,
  RequestResult,
} from "../../types.ts";

export function executeChatHistory(
  n: NormalizedRequest,
  packet: ContextPacket,
): { result: RequestResult; evidence: Evidence[] } {
  const hit = packet.priorChatMatches[0];
  if (!hit) {
    return {
      result: {
        requestId: n.request.id,
        status: "unresolved",
        evidenceIds: [],
        reason: "no_prior_chat",
      },
      evidence: [],
    };
  }
  const id = `ev_chat_${n.request.id}`;
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
        sourceType: "chat_history",
        excerpt: hit.text,
        source: { chatId: hit.id },
        scores: {
          [n.request.id]: {
            subjectMatch: 0.7,
            propertyMatch: 0.6,
            relevance: hit.score ?? 0.6,
            authority: 60,
            freshnessValid: true,
          },
        },
      },
    ],
  };
}
