/**
 * Plan validator — ask coverage, constraint binding, graph health (v4 §10 step 3).
 */

import type { RequestLedger } from "./request-scanner.ts";
import type { ResearchTurnPlan } from "@/lib/ai/turn-environment/research-turn-plan.ts";
import type { TaskGraph } from "./task-graph.ts";
import { validateRetrievalGraph } from "./task-graph.ts";
import { bindConstraints } from "./constraint-enforcement.ts";

export type PlanHealth = "ok" | "degraded" | "invalid";

export type PlanValidationResult = {
  health: PlanHealth;
  issues: string[];
  askCoverage: boolean;
  constraintBound: boolean;
  needsAskExtractor: boolean;
};

export function validateTaskPlan(opts: {
  ledger: RequestLedger;
  graph: TaskGraph;
  researchPlan?: ResearchTurnPlan | null;
  retrievalRequired?: boolean;
}): PlanValidationResult {
  const issues: string[] = [];
  const { ledger, graph, researchPlan } = opts;

  const askNodes = graph.nodes.filter((n) => n.kind === "ASK");
  const researchNodes = graph.nodes.filter((n) => n.kind === "RESEARCH");
  const retrieveNodes = graph.nodes.filter((n) => n.kind === "RETRIEVE");

  if (opts.retrievalRequired) {
    issues.push(
      ...validateRetrievalGraph({
        graph,
        ledger,
        researchPlan,
        retrievalRequired: true,
      }),
    );
  }

  if (ledger.asks.length > 0 && askNodes.length < ledger.asks.length) {
    issues.push("ask_coverage_gap");
  }

  if (
    researchPlan &&
    researchPlan.subtasks.length >= 2 &&
    researchNodes.length !== researchPlan.subtasks.length
  ) {
    issues.push("research_subtask_mismatch");
  }

  if (
    ledger.asks.length >= 2 &&
    researchNodes.length === 0 &&
    retrieveNodes.length < ledger.asks.length &&
    !researchPlan
  ) {
    issues.push("multi_ask_no_decomposition");
  }

  const bound = bindConstraints(ledger.constraints);
  for (const c of ledger.constraints) {
    if (!bound.some((b) => b.id === c.id)) {
      issues.push(`constraint_unbound:${c.id}`);
    }
  }

  const needsAskExtractor =
    ledger.askExtractorTriggers.length > 0 &&
    (issues.includes("multi_ask_no_decomposition") ||
      issues.includes("ask_coverage_gap") ||
      ledger.askExtractorTriggers.includes("implicit_ask_shape"));

  if (needsAskExtractor) {
    issues.push("ask_extractor_recommended");
  }

  const constraintBound = !issues.some((i) => i.startsWith("constraint_unbound"));
  const askCoverage =
    ledger.asks.length === 0 ||
    askNodes.length >= ledger.asks.length ||
    Boolean(researchPlan?.subtasks.length);

  let health: PlanHealth = "ok";
  if (
    issues.some(
      (i) =>
        i === "research_subtask_mismatch" ||
        i.startsWith("retrieval_required_no_") ||
        i.startsWith("retrieval_missing_for_ask:"),
    )
  ) {
    health = "invalid";
  } else if (issues.length > 0) {
    health = "degraded";
  }

  return {
    health,
    issues,
    askCoverage,
    constraintBound,
    needsAskExtractor,
  };
}
