/**
 * Subproblem escalation — never hand the entire project to a frontier model.
 */

import type { BuildTaskComplexity, TurnPlan } from "./types.ts";

export type BuildEscalationDecision = {
  escalate: boolean;
  reason: string | null;
  /** Narrow subproblem description for the larger model. */
  subproblem: string | null;
};

export function decideBuildEscalation(opts: {
  plan: TurnPlan | null;
  complexity: BuildTaskComplexity;
  repairAttempts: number;
  hasRecipe: boolean;
  hasComponentCandidate: boolean;
  novelCodeRequired?: boolean;
}): BuildEscalationDecision {
  if (!opts.plan) {
    return { escalate: false, reason: null, subproblem: null };
  }

  if (opts.complexity === "complex" || opts.novelCodeRequired) {
    return {
      escalate: true,
      reason: "complex_or_novel",
      subproblem: summarizeSubproblem(opts.plan),
    };
  }

  if (opts.repairAttempts >= 2) {
    return {
      escalate: true,
      reason: "repeated_repair_failure",
      subproblem: summarizeSubproblem(opts.plan),
    };
  }

  if (
    opts.plan.operations.some(
      (o) => o.type === "component.search" || o.type === "component.replace",
    ) &&
    !opts.hasComponentCandidate
  ) {
    return {
      escalate: true,
      reason: "no_suitable_component",
      subproblem: summarizeSubproblem(opts.plan),
    };
  }

  if (
    opts.plan.operations.some((o) => o.type === "recipe.apply") &&
    !opts.hasRecipe
  ) {
    return {
      escalate: true,
      reason: "no_suitable_recipe",
      subproblem: summarizeSubproblem(opts.plan),
    };
  }

  return { escalate: false, reason: null, subproblem: null };
}

function summarizeSubproblem(plan: TurnPlan): string {
  return `objective=${plan.objective}; ops=${plan.operations
    .map((o) => o.type)
    .join(",")}`;
}
