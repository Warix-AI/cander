/**
 * Per-task evidence validation (v4 TaskGraph refactor).
 * API success ≠ task success — evidence must verify against the ask.
 */

import type { TaskNode, TaskGraph } from "./task-graph.ts";
import type { TurnEvidence } from "./evidence.ts";
import type { ResearchTurnPlan } from "../turn-environment/research-turn-plan.ts";
import {
  validateResearchCompletion,
  type ResearchCompletionResult,
} from "../turn-environment/research-turn-plan.ts";
import { hasUsableEvidenceSnippets } from "./grounding-validator.ts";
import { verifyEvidenceForTask } from "./evidence-verification.ts";
import type { TemporalGrounding } from "./temporal-grounding.ts";
import type { TurnTaskResolution } from "../turn-environment/turn-task.ts";

export type TaskValidationResult = {
  nodeId: string;
  satisfied: boolean;
  reason?: string;
  refinedQuery?: string;
  alternateCapability?: "web.read" | "web.search";
  needsVerificationSearch?: boolean;
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

export function validateTaskEvidence(opts: {
  node: TaskNode;
  evidence: TurnEvidence[];
  researchPlan?: ResearchTurnPlan | null;
  researchCompletion?: ResearchCompletionResult | null;
  temporalGrounding?: TemporalGrounding | null;
  turnTask?: TurnTaskResolution;
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
          ? `${node.query} official verified source ${opts.temporalGrounding?.year ?? ""}`.trim()
          : undefined,
      };
    }
    return { nodeId, satisfied: true };
  }

  const items = evidenceForNode(node, opts.evidence);

  // Explicit URL fetch: any usable page/search hit for this node is enough.
  // Do not rewrite the URL query into a search phrase (breaks web.read).
  if (node.kind === "FETCH_URL") {
    const usable = items.some(
      (e) => e.ok && e.content.trim().length >= 24,
    );
    if (usable) return { nodeId, satisfied: true };
    return {
      nodeId,
      satisfied: false,
      reason: "url_fetch_empty",
      // Keep the original URL for retry/site fallback — never append search filler.
      refinedQuery: node.query,
      alternateCapability: "web.search",
    };
  }

  if (opts.temporalGrounding) {
    const verification = verifyEvidenceForTask({
      node,
      evidence: opts.evidence,
      grounding: opts.temporalGrounding,
      turnTask: opts.turnTask,
    });
    if (verification.verified) {
      return { nodeId, satisfied: true };
    }
    if (verification.issues.includes("snippets_only") && items.some((e) => e.url)) {
      return {
        nodeId,
        satisfied: false,
        reason: "snippets_only",
        alternateCapability: "web.read",
        refinedQuery: verification.refinedQuery ?? node.query,
        needsVerificationSearch: verification.needsVerificationSearch,
      };
    }
    return {
      nodeId,
      satisfied: false,
      reason: verification.reason ?? "evidence_unverified",
      refinedQuery: verification.refinedQuery,
      alternateCapability: "web.search",
      needsVerificationSearch: verification.needsVerificationSearch,
    };
  }

  if (!items.length) {
    return {
      nodeId,
      satisfied: false,
      reason: "no_evidence",
      refinedQuery: node.query
        ? `${node.query} official source verified`
        : node.label.slice(0, 200),
    };
  }

  const direct = items.find((e) => e.kind === "exa_synthesis" && e.content.trim().length >= 12);
  if (direct) return { nodeId, satisfied: true };

  const combined = items.map((e) => e.content).join(" ");
  if (combined.length >= 40 && /\d/.test(combined)) {
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
    reason: "weak_evidence",
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
  temporalGrounding?: TemporalGrounding | null;
  turnTask?: TurnTaskResolution;
}): TaskValidationResult[] {
  return opts.graph.nodes
    .filter((n) => n.kind === "RETRIEVE" || n.kind === "RESEARCH" || n.kind === "FETCH_URL")
    .filter((n) => n.status === "RUNNING" || n.status === "SUCCEEDED")
    .map((node) =>
      validateTaskEvidence({
        node,
        evidence: opts.evidence,
        researchPlan: opts.researchPlan,
        researchCompletion: opts.researchCompletion,
        temporalGrounding: opts.temporalGrounding,
        turnTask: opts.turnTask,
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
