/**
 * PCC escalation matrix — reasoning levels when on-device budget is exhausted (v4 §7 Phase 3).
 */

import {
  getPccAvailability,
  type PccReasoningLevel,
  type PccSessionProfile,
} from "../intelligence/pcc.ts";

export type PccEscalationDecision = {
  level: PccReasoningLevel;
  profile: PccSessionProfile;
  reason: string;
};

export function evaluatePccEscalation(opts: {
  question: string;
  modelBudgetExhausted?: boolean;
  evidenceTokenEstimate?: number;
  multiSubtaskResearch?: boolean;
}): PccEscalationDecision | null {
  const longQuestion = opts.question.trim().length > 280;
  const heavyEvidence = (opts.evidenceTokenEstimate ?? 0) > 2400;

  if (opts.modelBudgetExhausted) {
    return {
      level: opts.multiSubtaskResearch || heavyEvidence ? "high" : "medium",
      profile: opts.multiSubtaskResearch ? "plan" : "execute",
      reason: "on_device_model_budget_exhausted",
    };
  }

  if (opts.multiSubtaskResearch && heavyEvidence) {
    return {
      level: "medium",
      profile: "plan",
      reason: "multi_subtask_heavy_evidence",
    };
  }

  if (longQuestion && heavyEvidence) {
    return {
      level: "low",
      profile: "review",
      reason: "long_question_heavy_evidence",
    };
  }

  return null;
}

export type PccGenerateResult = {
  content: string;
  level: PccReasoningLevel;
  profile: PccSessionProfile;
};

/** Attempt PCC generation when escalation applies; null when unavailable. */
export async function tryPccGeneration(opts: {
  prompt: string;
  instructions?: string;
  decision: PccEscalationDecision;
}): Promise<PccGenerateResult | null> {
  const avail = await getPccAvailability();
  if (!avail.available) return null;

  const { createPccLanguageModel } = await import("../intelligence/pcc.ts");
  const model = createPccLanguageModel();
  try {
    const result = await model.generate({
      prompt: opts.prompt,
      instructions: opts.instructions,
      profile: opts.decision.profile,
      reasoningLevel: opts.decision.level,
    });
    const content = result.content?.trim();
    if (!content) return null;
    return {
      content,
      level: opts.decision.level,
      profile: opts.decision.profile,
    };
  } catch {
    return null;
  }
}
