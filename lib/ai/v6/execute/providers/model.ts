/**
 * Model provider — policy_trusted only (never verified).
 */

import type { Evidence, NormalizedRequest, RequestResult } from "../../types.ts";

export type ModelAnswerFn = (prompt: string) => Promise<string>;

const STUBS: Record<string, string> = {
  "concept.photosynthesis":
    "Photosynthesis is the process by which green plants convert light energy into chemical energy, producing sugars from carbon dioxide and water and releasing oxygen.",
  "concept.explanation":
    "Here is a clear explanation based on established knowledge.",
  "geography.elevation":
    "Mount Everest rises about 8,849 meters (29,032 feet) above sea level.",
};

export async function executeModel(
  n: NormalizedRequest,
  answer?: ModelAnswerFn,
  deps?: Map<string, import("../../types.ts").RequestResult>,
): Promise<{ result: RequestResult; evidence: Evidence[] }> {
  if (n.request.kind === "compare" && deps) {
    const parts = (n.request.dependencies || [])
      .map((d) => deps.get(d.requestId))
      .filter(Boolean)
      .map((r) => String(r!.value));
    if (parts.length >= 2) {
      const text = `Comparison:\n— ${parts[0]}\n— ${parts[1]}`;
      return {
        result: {
          requestId: n.request.id,
          status: "policy_trusted",
          value: text,
          evidenceIds: [],
          reason: "compare_synthesis",
        },
        evidence: [],
      };
    }
  }

  const key = n.property.canonicalKey || "";
  let text = STUBS[key];

  if (!text && answer) {
    const subject =
      n.request.subject?.type === "named" ? n.request.subject.value : "topic";
    text = await answer(`Explain briefly: ${subject} (${n.property.raw || key})`);
  }

  if (!text) {
    const subject =
      n.request.subject?.type === "named" ? n.request.subject.value : "topic";
    text = `Explanation of ${subject} (model knowledge).`;
  }

  return {
    result: {
      requestId: n.request.id,
      status: "policy_trusted",
      value: text,
      evidenceIds: [],
      reason: "model_policy_trusted",
    },
    evidence: [],
  };
}
