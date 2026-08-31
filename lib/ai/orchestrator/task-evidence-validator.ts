/**
 * Per-task evidence validation (v4 TaskGraph refactor).
 */

import type { TaskNode, TaskGraph } from "./task-graph.ts";
import type { TurnEvidence } from "./evidence.ts";
import type { ResearchTurnPlan } from "../turn-environment/research-turn-plan.ts";
import {
  validateResearchCompletion,
  type ResearchCompletionResult,
} from "../turn-environment/research-turn-plan.ts";
import { hasUsableEvidenceSnippets } from "./grounding-validator.ts";

export type TaskValidationResult = {
  nodeId: string;
  satisfied: boolean;
  reason?: string;
  refinedQuery?: string;
  alternateCapability?: "web.read" | "web.search";
};

function evidenceForNode(node: TaskNode, evidence: TurnEvidence[]): TurnEvidence[] {
  const nodeId = node.subtaskId ?? node.id;
  return evidence.filter(
    (e) =>
      e.ok &&
      e.content.trim() &&
      (e.subtaskId === nodeId ||
        e.id.startsWith(`st_${nodeId}_`) ||
        e.id.includes(nodeId)),
  );
}

function genericAskSatisfied(node: TaskNode, items: TurnEvidence[]): boolean {
  if (!items.length) return false;
  const direct = items.find((e) => e.kind === "exa_synthesis" && e.content.trim().length >= 12);
  if (direct) return true;
  const combined = items.map((e) => e.content).join(" ");
  if (combined.length < 40) return false;
  if (/\d/.test(combined)) return true;
  const qWords = (node.query ?? node.label)
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const hit = qWords.filter((w) => combined.toLowerCase().includes(w)).length;
  return hit >= Math.min(2, qWords.length);
}

export function validateTaskEvidence(opts: {
  node: TaskNode;
  evidence: TurnEvidence[];
  researchPlan?: ResearchTurnPlan | null;
  researchCompletion?: ResearchCompletionResult | null;
}): TaskValidationResult {
  const { node } = opts;
  const nodeId = node.subtaskId ?? node.id;

  if (node.kind === "RESEARCH" && opts.researchPlan && opts.researchCompletion) {
    const unresolved = opts.researchCompletion.unresolved;
    if (unresolved.includes(nodeId)) {
      return {
        nodeId,
        satisfied: false,
        reason: "research_subtask_unresolved",
        refinedQuery: node.query
          ? `${node.query} official verified source`
          : undefined,
      };
    }
    return { nodeId, satisfied: true };
  }

  const items = evidenceForNode(node, opts.evidence);
  if (genericAskSatisfied(node, items)) {
    return { nodeId, satisfied: true };
  }

  if (items.some((e) => e.kind === "search_result" && e.url)) {
    return {
      nodeId,
      satisfied: false,
      reason: "snippets_only",
      alternateCapability: "web.read",
      refinedQuery: node.query,
    };
  }

  return {
    nodeId,
    satisfied: false,
    reason: items.length ? "weak_evidence" : "no_evidence",
    refinedQuery: node.query
      ? `${node.query} official source verified`
      : node.label.slice(0, 200),
  };
}

export function validateAllTasks(opts: {
  graph: TaskGraph;
  evidence: TurnEvidence[];
  researchPlan?: ResearchTurnPlan | null;
  researchCompletion?: ResearchCompletionResult | null;
}): TaskValidationResult[] {
  return opts.graph.nodes
    .filter((n) => n.kind === "RETRIEVE" || n.kind === "RESEARCH")
    .filter((n) => n.status === "RUNNING" || n.status === "SUCCEEDED")
    .map((node) =>
      validateTaskEvidence({
        node,
        evidence: opts.evidence,
        researchPlan: opts.researchPlan,
        researchCompletion: opts.researchCompletion,
      }),
    );
}

export function computeResearchCompletion(
  plan: ResearchTurnPlan,
  evidence: TurnEvidence[],
): ResearchCompletionResult {
  return validateResearchCompletion(plan, evidence);
}

export function anyRetrievalEvidence(evidence: TurnEvidence[]): boolean {
  return hasUsableEvidenceSnippets(evidence);
}
