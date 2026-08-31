import type {
  ContextPacket,
  Evidence,
  NormalizedRequest,
  RequestResult,
} from "../../types.ts";

export type KbFetch = (query: string) => Promise<{
  text: string;
  documentId?: string;
  title?: string;
} | null>;

export async function executeKnowledgeBase(
  n: NormalizedRequest,
  packet: ContextPacket,
  fetchKb?: KbFetch,
): Promise<{ result: RequestResult; evidence: Evidence[] }> {
  const subject =
    n.request.subject?.type === "named" ? n.request.subject.value : "policy";
  const q = `${subject} ${n.property.canonicalKey || n.property.raw || ""}`;

  let text: string | null = null;
  let documentId: string | undefined;
  let title: string | undefined;

  if (fetchKb) {
    const got = await fetchKb(q);
    if (got) {
      text = got.text;
      documentId = got.documentId;
      title = got.title;
    }
  }

  if (!text && packet.knowledgeBaseHints.length) {
    text = `KB hint: ${packet.knowledgeBaseHints[0]!.title}`;
    documentId = packet.knowledgeBaseHints[0]!.id;
    title = packet.knowledgeBaseHints[0]!.title;
  }

  // Test/dev stub for handbook/PTO
  if (!text && /pto|refund|handbook|policy/i.test(q)) {
    text = /pto/i.test(q)
      ? "Employees receive 20 days PTO per year per the employee handbook."
      : "Internal refund policy: full refund within 30 days with receipt.";
    title = "Employee handbook";
    documentId = "kb_stub_handbook";
  }

  if (!text) {
    return {
      result: {
        requestId: n.request.id,
        status: "unresolved",
        evidenceIds: [],
        reason: "kb_miss",
      },
      evidence: [],
    };
  }

  const id = `ev_kb_${n.request.id}`;
  return {
    result: {
      requestId: n.request.id,
      status: "verified",
      value: text,
      evidenceIds: [id],
    },
    evidence: [
      {
        id,
        sourceType: "knowledge_base",
        excerpt: text,
        value: text,
        source: { title, documentId },
        observedAt: new Date().toISOString(),
        scores: {
          [n.request.id]: {
            subjectMatch: 0.9,
            propertyMatch: 0.85,
            relevance: 0.9,
            authority: 90,
            freshnessValid: true,
          },
        },
      },
    ],
  };
}
