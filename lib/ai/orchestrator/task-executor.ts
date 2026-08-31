/**
 * TaskGraph executor — parallel/sequential per-task tool routing (v4 refactor).
 */

import {
  blockDownstreamTasks,
  getReadyTasks,
  hasNonTerminalRetrieval,
  markExecutableNodesRunning,
  setSubtaskStatus,
  type TaskGraph,
  type TaskNode,
} from "./task-graph.ts";
import { applyPreConstraints } from "./constraint-enforcement.ts";
import {
  validateAllTasks,
  computeResearchCompletion,
  type TaskValidationResult,
} from "./task-evidence-validator.ts";
import { runParallelTasks } from "../turn-environment/parallel.ts";
import { webSearchArguments } from "../turn-environment/retrieval-args.ts";
import type { TurnTaskResolution } from "../turn-environment/turn-task.ts";
import type { ConversationTurnState } from "../turn-environment/conversation-types.ts";
import type { WebRetrievalPlan } from "../turn-environment/web-retrieval-plan.ts";
import type {
  ResearchTurnPlan,
  ResearchCompletionResult,
} from "../turn-environment/research-turn-plan.ts";
import {
  type TurnEvidence,
} from "./evidence.ts";
import type { AiToolCallResult } from "../runtime/tools";
import type { ProvenanceAtom } from "../turn-environment/index.ts";
import type { AgentTurnProgress } from "../runtime/agent-turn.ts";

function appendEvidence(target: TurnEvidence[], items: TurnEvidence[]): void {
  for (const item of items) {
    if (!target.some((e) => e.id === item.id)) target.push(item);
  }
}

export type TaskExecutorContext = {
  content: string;
  turnTask: TurnTaskResolution;
  conversationState: ConversationTurnState;
  webRetrievalPlan?: WebRetrievalPlan;
  researchPlan?: ResearchTurnPlan | null;
  constraints: TaskGraph["constraints"];
  executeTool: (opts: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<AiToolCallResult>;
  mapToolResult: (
    result: AiToolCallResult,
    subtaskId?: string,
  ) => { evidence: TurnEvidence[]; atoms: ProvenanceAtom[] };
  report: (progress: AgentTurnProgress) => void;
  onGraphChange?: (graph: TaskGraph) => void;
  detailForTool: (name: string) => string;
  emitToolStart?: (name: string, reason: string) => void;
  emitToolEnd?: (name: string, ok: boolean, durationMs: number) => void;
};

export type TaskExecutorResult = {
  graph: TaskGraph;
  evidence: TurnEvidence[];
  toolResults: AiToolCallResult[];
  provenanceBatches: ProvenanceAtom[][];
  researchCompletion: ResearchCompletionResult | null;
};

function buildArgsForNode(
  node: TaskNode,
  ctx: TaskExecutorContext,
): Record<string, unknown> {
  const capability = node.capability ?? "web.search";
  if (capability === "web.read" || capability === "web.open") {
    const url = node.query?.startsWith("http") ? node.query : undefined;
    return applyPreConstraints(
      url ? { url } : { query: node.query ?? node.label },
      ctx.constraints,
    );
  }
  const args = webSearchArguments({
    content: ctx.content,
    turnTask: ctx.turnTask,
    conv: ctx.conversationState,
    webRetrievalPlan: ctx.webRetrievalPlan,
    query: node.query ?? node.label,
    deeper: Boolean(ctx.conversationState.dissatisfactionSignal),
  });
  return applyPreConstraints(args, ctx.constraints);
}

async function executeReadyBatch(
  graph: TaskGraph,
  ready: TaskNode[],
  ctx: TaskExecutorContext,
  evidence: TurnEvidence[],
  toolResults: AiToolCallResult[],
  provenanceBatches: ProvenanceAtom[][],
): Promise<TaskGraph> {
  if (!ready.length) return graph;

  let nextGraph = markExecutableNodesRunning(
    graph,
    ready.map((n) => n.id),
  );
  ctx.onGraphChange?.(nextGraph);

  const parallel = await runParallelTasks({
    tasks: ready.map((node) => ({
      id: node.subtaskId ?? node.id,
      run: async (signal) => {
        if (signal.aborted) throw new Error("cancelled");
        const capability = node.capability ?? "web.search";
        const toolName =
          capability === "web.read"
            ? "web.read"
            : capability === "web.open"
              ? "web.open"
              : "web.search";
        ctx.emitToolStart?.(toolName, `task:${node.id}`);
        ctx.report({
          phase: "tool",
          label: "Thinking",
          detail: ctx.detailForTool(toolName),
          toolName,
        });
        const started = Date.now();
        const result = await ctx.executeTool({
          name: toolName,
          arguments: buildArgsForNode(node, ctx),
        });
        ctx.emitToolEnd?.(toolName, result.ok, Date.now() - started);
        if (signal.aborted) throw new Error("cancelled");
        return { node, result };
      },
    })),
    concurrency: Math.min(ready.length, 5),
    timeoutMs: 45_000,
  });

  for (const item of parallel) {
    if (!item.ok || !item.value) {
      const nodeId = item.id;
      nextGraph = setSubtaskStatus(nextGraph, nodeId, "FAILED", "tool_error");
      nextGraph = blockDownstreamTasks(nextGraph, nodeId);
      continue;
    }
    const { node, result } = item.value;
    const nodeId = node.subtaskId ?? node.id;
    toolResults.push(result);
    if (!result.ok) {
      nextGraph = setSubtaskStatus(nextGraph, nodeId, "FAILED", "tool_error");
      nextGraph = blockDownstreamTasks(nextGraph, nodeId);
      continue;
    }
    const mapped = ctx.mapToolResult(result, nodeId);
    appendEvidence(evidence, mapped.evidence);
    provenanceBatches.push(mapped.atoms);
    nextGraph = setSubtaskStatus(nextGraph, nodeId, "SUCCEEDED");
  }

  ctx.onGraphChange?.(nextGraph);
  return nextGraph;
}

function applyValidationResults(
  graph: TaskGraph,
  validations: TaskValidationResult[],
): TaskGraph {
  let next = graph;
  for (const v of validations) {
    if (v.satisfied) {
      next = setSubtaskStatus(next, v.nodeId, "SUCCEEDED");
      continue;
    }
    const node = next.nodes.find((n) => n.id === v.nodeId || n.subtaskId === v.nodeId);
    const retries = node?.retryCount ?? 0;
    if (retries >= next.maxRetrievalRounds) {
      next = setSubtaskStatus(next, v.nodeId, "UNRESOLVED", v.reason);
      continue;
    }
    next = {
      ...next,
      nodes: next.nodes.map((n) =>
        n.id === v.nodeId || n.subtaskId === v.nodeId
          ? {
              ...n,
              status: "PENDING" as const,
              retryCount: retries + 1,
              query: v.refinedQuery ?? n.query,
              capability: v.alternateCapability ?? n.capability,
            }
          : n,
      ),
    };
  }
  return next;
}

/** Run TaskGraph waves until all retrieval nodes terminal or rounds exhausted. */
export async function runTaskGraphExecution(opts: {
  graph: TaskGraph;
  ctx: TaskExecutorContext;
  evidence: TurnEvidence[];
  toolResults: AiToolCallResult[];
  provenanceBatches: ProvenanceAtom[][];
  /** Non-graph pre-run tasks (URL, browser) run once before graph waves. */
  preGraphTasks?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    reason: string;
  }>;
}): Promise<TaskExecutorResult> {
  let graph = opts.graph;
  const evidence = opts.evidence;
  const toolResults = opts.toolResults;
  const provenanceBatches = opts.provenanceBatches;

  for (const task of opts.preGraphTasks ?? []) {
    const result = await opts.ctx.executeTool({
      name: task.name,
      arguments: task.arguments,
    });
    toolResults.push(result);
    const mapped = opts.ctx.mapToolResult(result);
    appendEvidence(evidence, mapped.evidence);
    provenanceBatches.push(mapped.atoms);
  }

  while (
    graph.retrievalRound < graph.maxRetrievalRounds &&
    hasNonTerminalRetrieval(graph)
  ) {
    const ready = getReadyTasks(graph);
    if (!ready.length) break;

    graph = await executeReadyBatch(
      graph,
      ready,
      opts.ctx,
      evidence,
      toolResults,
      provenanceBatches,
    );

    let researchCompletion: ResearchCompletionResult | null = null;
    if (opts.ctx.researchPlan) {
      researchCompletion = computeResearchCompletion(opts.ctx.researchPlan, evidence);
    }

    const validations = validateAllTasks({
      graph,
      evidence,
      researchPlan: opts.ctx.researchPlan,
      researchCompletion,
    });
    graph = applyValidationResults(graph, validations);

    graph = { ...graph, retrievalRound: graph.retrievalRound + 1 };
    opts.ctx.onGraphChange?.(graph);
  }

  let researchCompletion: ResearchCompletionResult | null = null;
  if (opts.ctx.researchPlan) {
    researchCompletion = computeResearchCompletion(opts.ctx.researchPlan, evidence);
    const unresolved = researchCompletion.unresolved;
    for (const n of graph.nodes) {
      if (n.kind !== "RESEARCH" && n.kind !== "RETRIEVE") continue;
      const id = n.subtaskId ?? n.id;
      if (unresolved.includes(id)) {
        graph = setSubtaskStatus(graph, id, "UNRESOLVED", "research_incomplete");
      }
    }
  }

  for (const n of graph.nodes) {
    if (n.kind !== "RETRIEVE" && n.kind !== "RESEARCH") continue;
    if (n.status === "PENDING" || n.status === "READY" || n.status === "RUNNING") {
      graph = setSubtaskStatus(graph, n.id, "UNRESOLVED", "max_rounds");
    }
  }

  return {
    graph,
    evidence,
    toolResults,
    provenanceBatches,
    researchCompletion,
  };
}
