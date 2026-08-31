/**
 * Deterministic response renderer — expand shapes that skip FM (v4 §7 Phase 3).
 */

import type { CompactEvidenceItem } from "../answer-shape/index.ts";
import {
  answerShapeFromContract,
  deterministicAnswerFromEvidence,
  extractRequestedItemCount,
  inferResponseContract,
} from "../answer-shape/index.ts";
import type { ResearchCompletionResult } from "../turn-environment/research-turn-plan.ts";
import type { ResearchTurnPlan } from "../turn-environment/research-turn-plan.ts";
import type { TurnEvidence } from "./evidence.ts";
import {
  extractFactualComponents,
  formatComponentBreakdown,
  resolveComponentFacts,
  sumVerifiedComponents,
  type EvidenceSnippet,
} from "./research-quality.ts";
import { stripInlineCitationMarkers } from "./citations.ts";
import { prepareSynthesisEvidence } from "./evidence.ts";

export type DeterministicRenderInput = {
  question: string;
  evidence: TurnEvidence[];
  researchPlan?: ResearchTurnPlan | null;
  researchCompletion?: ResearchCompletionResult | null;
};

function evidenceSnippets(items: TurnEvidence[]): EvidenceSnippet[] {
  return items
    .filter((e) => e.ok && e.content.trim())
    .map((e) => ({
      id: e.id,
      title: e.title,
      url: e.url,
      content: e.content,
      kind: e.kind,
    }));
}

/** Exa direct answer for simple factual turns. */
export function renderExaDirectAnswer(
  question: string,
  evidence: TurnEvidence[],
): string | null {
  const direct = evidence.find(
    (e) =>
      e.ok &&
      e.kind === "exa_synthesis" &&
      e.content.trim().length >= 8 &&
      e.groundingConfidence !== "low",
  );
  if (!direct) return null;
  const contract = inferResponseContract(question);
  if (
    contract.presentation === "list" ||
    contract.presentation === "bullet_list" ||
    extractRequestedItemCount(question) != null ||
    /\b(list\s+(every|all|each)|show\s+(me\s+)?(all|every))\b/i.test(question)
  ) {
    return null;
  }
  return stripInlineCitationMarkers(direct.content.trim());
}

/** Multi-component calorie/math breakdown without FM. */
export function renderComponentBreakdown(
  question: string,
  evidence: TurnEvidence[],
): string | null {
  const components = extractFactualComponents(question);
  if (components.length < 2) return null;
  const facts = resolveComponentFacts({
    components,
    evidence: evidenceSnippets(evidence),
  });
  const sum = sumVerifiedComponents(facts);
  if (!sum?.verified) return null;
  return formatComponentBreakdown({
    leadLabel: "total",
    facts,
    total: sum.total,
  });
}

/** Completed research plan with calculated total — verbalize deterministically. */
export function renderResearchCompletionAnswer(
  input: DeterministicRenderInput,
): string | null {
  const { researchPlan, researchCompletion, question } = input;
  if (
    !researchPlan ||
    !researchCompletion?.complete ||
    researchPlan.subtasks.length < 2
  ) {
    return null;
  }
  if (researchCompletion.calculatedTotal != null) {
    const lines = [
      `Based on verified nutrition data, the total is about ${Math.round(researchCompletion.calculatedTotal)} calories.`,
    ];
    if (researchCompletion.calculatedBreakdown) {
      lines.push("", researchCompletion.calculatedBreakdown.replace(/\n/g, "; "));
    }
    return lines.join("");
  }
  const synthesis = prepareSynthesisEvidence(question, input.evidence, "onDevice", {
    researchPlan,
    researchCompletion,
  });
  if (synthesis.compact.length) {
    return synthesis.compact
      .map((c) => `${c.title}: ${c.excerpt}`)
      .join(". ");
  }
  return null;
}

/** Narrow fallback when FM fails but evidence is strong. */
export function renderNarrowEvidenceFallback(
  question: string,
  evidence: TurnEvidence[],
): string | null {
  const direct = evidence.find(
    (e) => e.ok && e.kind === "exa_synthesis" && e.content.trim(),
  );
  if (direct) return direct.content.trim();

  const breakdown = renderComponentBreakdown(question, evidence);
  if (breakdown) return breakdown;

  const shape = answerShapeFromContract(question);
  const synthesis = prepareSynthesisEvidence(question, evidence, "onDevice");
  if (!synthesis.compact.length) return null;
  const strong = synthesis.compact.filter(
    (c) =>
      c.excerpt.length >= 40 &&
      (/\d/.test(c.excerpt) || shape.kind === "fact" || shape.kind === "calculation"),
  );
  if (!strong.length && shape.kind !== "comparison") return null;
  return deterministicAnswerFromEvidence({
    question,
    shape,
    evidence: (strong.length ? strong : synthesis.compact.slice(0, 3)) as CompactEvidenceItem[],
  });
}

/** First matching deterministic renderer, or null → use FM. */
export function tryDeterministicRender(
  input: DeterministicRenderInput,
): string | null {
  return (
    renderResearchCompletionAnswer(input) ??
    renderExaDirectAnswer(input.question, input.evidence) ??
    renderComponentBreakdown(input.question, input.evidence) ??
    null
  );
}

/** Shapes that should never go to FM when deterministic path succeeds. */
export function deterministicRenderPriority(
  input: DeterministicRenderInput,
): "research" | "exa_direct" | "component" | "none" {
  if (renderResearchCompletionAnswer(input)) return "research";
  if (renderExaDirectAnswer(input.question, input.evidence)) return "exa_direct";
  if (renderComponentBreakdown(input.question, input.evidence))
    return "component";
  return "none";
}
