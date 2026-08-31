/**
 * Task graph — executable ASK/CONSTRAINT/RESEARCH/RETRIEVE nodes.
 * Drives per-task routing, parallel/sequential execution, and coverage gating.
 */

import type { RequestLedger } from "./request-scanner.ts";
import type { ResearchTurnPlan } from "@/lib/ai/turn-environment/research-turn-plan.ts";
import type { TurnTaskResolution } from "@/lib/ai/turn-environment/turn-task.ts";
import { bindConstraints, type BoundConstraint } from "./constraint-enforcement.ts";
import type { UrlWorkflowSpec } from "./entity-action-binding.ts";
import {
  collectEntitiesFromMessage,
  graphHasFetchForDomain,
  slugDomain,
  wantsUrlWorkflow,
} from "./entity-action-binding.ts";
import { requiresExternalEvidence } from "./deterministic-triggers.ts";

export type TaskNodeStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED_BY_CONDITION"
  | "BLOCKED_UPSTREAM_FAILED"
  | "UNRESOLVED";

export type TaskNodeKind =
  | "ASK"
  | "RESEARCH"
  | "RETRIEVE"
  | "CONSTRAINT"
  | "FETCH_URL"
  | "SUMMARIZE_SITE";

export type TaskCapability = "web.search" | "web.read" | "web.open" | "none";

export type TaskNode = {
  id: string;
  kind: TaskNodeKind;
  label: string;
  status: TaskNodeStatus;
  subtaskId?: string;
  dependsOn?: string[];
  spanId?: string;
  /** Linked ASK node id for RETRIEVE/RESEARCH nodes. */
  askId?: string;
  capability?: TaskCapability;
  /** Atomic search/read query — never the full raw message when multi-task. */
  query?: string;
  evidenceIds?: string[];
  terminalReason?: string;
  retryCount?: number;
};

export type TaskGraph = {
  nodes: TaskNode[];
  constraints: BoundConstraint[];
  objective?: string;
  maxRetrievalRounds: number;
  retrievalRound: number;
};

const TERMINAL: TaskNodeStatus[] = [
  "SUCCEEDED",
  "FAILED",
  "SKIPPED_BY_CONDITION",
  "BLOCKED_UPSTREAM_FAILED",
  "UNRESOLVED",
];

export function isTerminalStatus(status: TaskNodeStatus): boolean {
  return TERMINAL.includes(status);
}

/** Build atomic query from a single ask span — not the full user message. */
export function atomicQueryFromAsk(
  askText: string,
  turnTask?: TurnTaskResolution,
): string {
  const trimmed = askText.trim();
  if (turnTask?.subject && !trimmed.toLowerCase().includes(turnTask.subject.toLowerCase())) {
    return `${turnTask.subject} ${trimmed}`.slice(0, 400);
  }
  return trimmed.slice(0, 400);
}

export function retrievalNodesForGraph(graph: TaskGraph): TaskNode[] {
  return graph.nodes.filter(
    (n) =>
      n.kind === "RETRIEVE" ||
      n.kind === "RESEARCH" ||
      n.kind === "FETCH_URL" ||
      n.kind === "SUMMARIZE_SITE",
  );
}

function isRetrievalKind(kind: TaskNodeKind): boolean {
  return (
    kind === "RETRIEVE" ||
    kind === "RESEARCH" ||
    kind === "FETCH_URL" ||
    kind === "SUMMARIZE_SITE"
  );
}

export function compileTaskGraph(opts: {
  ledger: RequestLedger;
  researchPlan?: ResearchTurnPlan | null;
  turnTask?: TurnTaskResolution;
  /** When true, every ASK gets a linked RETRIEVE node (unless research plan owns retrieval). */
  retrievalRequired?: boolean;
  /** Compound URL fetch → summarize workflows from entity binding. */
  urlWorkflows?: UrlWorkflowSpec[];
  /** Pre-built RETRIEVE nodes from AskExtractor. */
  retrieveSpecs?: Array<{
    id: string;
    label: string;
    query: string;
    capability?: TaskCapability;
    dependsOn?: string[];
    spanId?: string;
    askId?: string;
  }>;
}): TaskGraph {
  const nodes: TaskNode[] = [];

  for (const ask of opts.ledger.asks) {
    nodes.push({
      id: `ask_${ask.id}`,
      kind: "ASK",
      label: ask.text.slice(0, 100),
      status: "PENDING",
      spanId: ask.id,
    });
  }

  if (opts.researchPlan?.subtasks.length) {
    for (const st of opts.researchPlan.subtasks) {
      nodes.push({
        id: st.id,
        kind: "RESEARCH",
        label: st.label,
        status: "PENDING",
        subtaskId: st.id,
        dependsOn: st.dependsOn,
        query: st.query,
        capability: "web.search",
      });
    }
  } else if (opts.urlWorkflows?.length) {
    for (const wf of opts.urlWorkflows) {
      nodes.push({
        id: wf.fetchId,
        kind: "FETCH_URL",
        label: `Fetch ${wf.entity.domain}`,
        status: "PENDING",
        query: wf.entity.url,
        capability: "web.read",
        spanId: wf.askSpanId,
        askId: `ask_${wf.askSpanId}`,
        subtaskId: wf.fetchId,
      });
      nodes.push({
        id: wf.summarizeId,
        kind: "SUMMARIZE_SITE",
        label: `Summarize ${wf.entity.domain}`,
        status: "PENDING",
        dependsOn: [wf.fetchId],
        spanId: wf.askSpanId,
        askId: `ask_${wf.askSpanId}`,
        subtaskId: wf.summarizeId,
        capability: "none",
      });
    }
  } else if (opts.retrieveSpecs?.length) {
    for (const spec of opts.retrieveSpecs) {
      nodes.push({
        id: spec.id,
        kind: "RETRIEVE",
        label: spec.label.slice(0, 100),
        status: "PENDING",
        query: spec.query,
        capability: spec.capability ?? "web.search",
        dependsOn: spec.dependsOn,
        spanId: spec.spanId,
        askId: spec.askId,
        subtaskId: spec.id,
      });
    }
  } else if (opts.ledger.asks.length >= 1) {
    const retrievalRequired = opts.retrievalRequired ?? false;
    for (const ask of opts.ledger.asks) {
      const needsRetrieve =
        retrievalRequired ||
        requiresExternalEvidence(ask.text) ||
        requiresExternalEvidence(opts.ledger.rawInput);
      if (!needsRetrieve && opts.ledger.asks.length === 1) continue;
      const id = opts.ledger.asks.length === 1 ? "retrieve_primary" : `retrieve_${ask.id}`;
      nodes.push({
        id,
        kind: "RETRIEVE",
        label: ask.text.slice(0, 100),
        status: "PENDING",
        spanId: ask.id,
        askId: `ask_${ask.id}`,
        subtaskId: id,
        query: atomicQueryFromAsk(ask.text, opts.turnTask),
        capability: "web.search",
      });
    }
  }

  for (const c of opts.ledger.constraints) {
    nodes.push({
      id: `constraint_${c.id}`,
      kind: "CONSTRAINT",
      label: c.text.slice(0, 100),
      status: "SUCCEEDED",
      spanId: c.id,
    });
  }

  return {
    nodes,
    constraints: bindConstraints(opts.ledger.constraints),
    objective: opts.researchPlan?.objective,
    maxRetrievalRounds: opts.researchPlan?.maxRetrievalRounds ?? 2,
    retrievalRound: 0,
  };
}

/**
 * Repair graph when retrieval is required but no RETRIEVE/RESEARCH nodes exist.
 */
export function ensureRetrievalNodes(opts: {
  graph: TaskGraph;
  ledger: RequestLedger;
  turnTask?: TurnTaskResolution;
  researchPlan?: ResearchTurnPlan | null;
  retrievalRequired: boolean;
}): { graph: TaskGraph; repaired: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!opts.retrievalRequired) {
    return { graph: opts.graph, repaired: false, issues };
  }
  if (opts.researchPlan?.subtasks.length) {
    return { graph: opts.graph, repaired: false, issues };
  }
  if (retrievalNodesForGraph(opts.graph).length > 0) {
    return { graph: opts.graph, repaired: false, issues };
  }
  if (!opts.ledger.asks.length) {
    issues.push("retrieval_required_no_asks");
    return { graph: opts.graph, repaired: false, issues };
  }

  const injected: TaskNode[] = [];
  for (const ask of opts.ledger.asks) {
    const id =
      opts.ledger.asks.length === 1 ? "retrieve_primary" : `retrieve_${ask.id}`;
    injected.push({
      id,
      kind: "RETRIEVE",
      label: ask.text.slice(0, 100),
      status: "PENDING",
      spanId: ask.id,
      askId: `ask_${ask.id}`,
      subtaskId: id,
      query: atomicQueryFromAsk(ask.text, opts.turnTask),
      capability: "web.search",
    });
  }

  issues.push("retrieval_node_injected");
  const nodes = propagateAskStatus([...opts.graph.nodes, ...injected]);
  return {
    graph: { ...opts.graph, nodes },
    repaired: true,
    issues,
  };
}

/**
 * Repair graph when message contains a URL/domain but no fetch/browse task exists.
 */
export function ensureUrlFetchNodes(opts: {
  graph: TaskGraph;
  ledger: RequestLedger;
}): { graph: TaskGraph; repaired: boolean; issues: string[] } {
  const issues: string[] = [];
  const entities = collectEntitiesFromMessage(opts.ledger.rawInput);
  if (!entities.length) {
    return { graph: opts.graph, repaired: false, issues };
  }
  if (!wantsUrlWorkflow(opts.ledger.rawInput, entities)) {
    return { graph: opts.graph, repaired: false, issues };
  }

  const missing = entities.filter(
    (e) => !graphHasFetchForDomain(opts.graph, e.domain),
  );
  if (!missing.length) {
    return { graph: opts.graph, repaired: false, issues };
  }

  issues.push("url_fetch_injected");
  const urlWorkflows: UrlWorkflowSpec[] = missing.map((entity) => {
    const slug = slugDomain(entity.domain);
    return {
      entity,
      fetchId: `fetch_${slug}`,
      summarizeId: `summarize_${slug}`,
      askSpanId: `bound_${slug}`,
    };
  });

  const rebuilt = compileTaskGraph({
    ledger: opts.ledger,
    urlWorkflows,
  });

  const existingIds = new Set(opts.graph.nodes.map((n) => n.id));
  const injected = rebuilt.nodes.filter((n) => !existingIds.has(n.id));
  const nodes = propagateAskStatus([...opts.graph.nodes, ...injected]);

  return {
    graph: { ...opts.graph, nodes },
    repaired: true,
    issues,
  };
}

export function validateUrlFetchGraph(opts: {
  graph: TaskGraph;
  ledger: RequestLedger;
}): string[] {
  const issues: string[] = [];
  const entities = collectEntitiesFromMessage(opts.ledger.rawInput);
  if (!entities.length) return issues;
  if (!wantsUrlWorkflow(opts.ledger.rawInput, entities)) return issues;
  for (const entity of entities) {
    if (!graphHasFetchForDomain(opts.graph, entity.domain)) {
      issues.push(`url_without_fetch:${entity.domain}`);
    }
  }
  return issues;
}

export function validateRetrievalGraph(opts: {
  graph: TaskGraph;
  ledger: RequestLedger;
  researchPlan?: ResearchTurnPlan | null;
  retrievalRequired: boolean;
}): string[] {
  const issues: string[] = [];
  if (!opts.retrievalRequired) return issues;
  if (opts.researchPlan?.subtasks.length) return issues;
  if (retrievalNodesForGraph(opts.graph).length === 0) {
    issues.push("retrieval_required_no_nodes");
    return issues;
  }
  for (const ask of opts.ledger.asks) {
    const askId = `ask_${ask.id}`;
    const linked = opts.graph.nodes.filter(
      (n) =>
        isRetrievalKind(n.kind) &&
        (n.askId === askId || n.spanId === ask.id),
    );
    if (!linked.length) {
      issues.push(`retrieval_missing_for_ask:${ask.id}`);
    }
  }
  return issues;
}

export function bumpRetrievalRound(graph: TaskGraph): TaskGraph {
  return resetRetrievalForRetry(graph);
}

/** Re-open RETRIEVE nodes for a deeper retrieval round (e.g. dissatisfaction retry). */
export function resetRetrievalForRetry(graph: TaskGraph): TaskGraph {
  const nodes = graph.nodes.map((n) => {
    if (n.kind !== "RETRIEVE" && n.kind !== "FETCH_URL") return n;
    return {
      ...n,
      status: "PENDING" as const,
      terminalReason: undefined,
      retryCount: (n.retryCount ?? 0) + 1,
    };
  });
  return {
    ...graph,
    retrievalRound: graph.retrievalRound + 1,
    nodes: propagateAskStatus(nodes),
  };
}

export function setTaskStatus(
  graph: TaskGraph,
  nodeId: string,
  status: TaskNodeStatus,
  terminalReason?: string,
): TaskGraph {
  const next = graph.nodes.map((n) => {
    if (n.id !== nodeId && n.subtaskId !== nodeId) return n;
    return {
      ...n,
      status,
      ...(terminalReason ? { terminalReason } : {}),
    };
  });
  return { ...graph, nodes: propagateAskStatus(next) };
}

export function setSubtaskStatus(
  graph: TaskGraph,
  subtaskId: string,
  status: TaskNodeStatus,
  terminalReason?: string,
): TaskGraph {
  return setTaskStatus(graph, subtaskId, status, terminalReason);
}

/** When fetch completes, summarize gates become ready for synthesis. */
function promoteSummarizeNodes(nodes: TaskNode[]): TaskNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.map((n) => {
    if (n.kind !== "SUMMARIZE_SITE" || n.status !== "PENDING") return n;
    const deps = n.dependsOn ?? [];
    if (!deps.length) return n;
    const fetchReady = deps.every((depId) => {
      const dep = byId.get(depId);
      return (
        dep &&
        (dep.status === "SUCCEEDED" || dep.status === "SKIPPED_BY_CONDITION")
      );
    });
    return fetchReady ? { ...n, status: "SUCCEEDED" as const } : n;
  });
}

/** Propagate retrieval status to linked ASK nodes. */
export function propagateAskStatus(nodes: TaskNode[]): TaskNode[] {
  const promoted = promoteSummarizeNodes(nodes);
  const retrievalByAsk = new Map<string, TaskNode[]>();
  for (const n of promoted) {
    if (!isRetrievalKind(n.kind)) continue;
    const askId =
      n.askId ??
      (n.id.startsWith("retrieve_") ? `ask_${n.spanId}` : undefined);
    if (!askId) continue;
    const list = retrievalByAsk.get(askId) ?? [];
    list.push(n);
    retrievalByAsk.set(askId, list);
  }

  return promoted.map((n) => {
    if (n.kind !== "ASK") return n;
    const linked = retrievalByAsk.get(n.id) ?? [];
    if (!linked.length) return n;
    if (linked.every((r) => r.status === "SUCCEEDED" || r.status === "SKIPPED_BY_CONDITION")) {
      return { ...n, status: "SUCCEEDED" as const };
    }
    if (linked.some((r) => r.status === "RUNNING")) {
      return { ...n, status: "RUNNING" as const };
    }
    if (linked.every((r) => isTerminalStatus(r.status))) {
      if (linked.some((r) => r.status === "SUCCEEDED" || r.status === "SKIPPED_BY_CONDITION")) {
        if (linked.some((r) => r.status === "UNRESOLVED" || r.status === "FAILED")) {
          return { ...n, status: "UNRESOLVED" as const };
        }
        return { ...n, status: "SUCCEEDED" as const };
      }
      return { ...n, status: "UNRESOLVED" as const };
    }
    return n;
  });
}

export function executableNodes(graph: TaskGraph): TaskNode[] {
  return graph.nodes.filter(
    (n) =>
      (n.kind === "RETRIEVE" || n.kind === "RESEARCH" || n.kind === "FETCH_URL") &&
      (n.kind === "FETCH_URL" ||
        n.capability === "web.search" ||
        n.capability === "web.read" ||
        n.capability === "web.open"),
  );
}

export function getReadyTasks(graph: TaskGraph): TaskNode[] {
  const nodes = executableNodes(graph);
  return nodes.filter((n) => {
    if (n.status !== "PENDING" && n.status !== "READY") return false;
    const deps = n.dependsOn ?? [];
    if (!deps.length) return true;
    return deps.every((depId) => {
      const dep = graph.nodes.find((d) => d.id === depId || d.subtaskId === depId);
      return dep && (dep.status === "SUCCEEDED" || dep.status === "SKIPPED_BY_CONDITION");
    });
  });
}

export function hasNonTerminalRetrieval(graph: TaskGraph): boolean {
  return executableNodes(graph).some((n) => !isTerminalStatus(n.status));
}

export function markExecutableNodesRunning(graph: TaskGraph, ids: string[]): TaskGraph {
  const idSet = new Set(ids);
  return {
    ...graph,
    nodes: propagateAskStatus(
      graph.nodes.map((n) =>
        idSet.has(n.id) && (n.status === "PENDING" || n.status === "READY")
          ? { ...n, status: "RUNNING" as const }
          : n,
      ),
    ),
  };
}

export function markResearchNodesRunning(graph: TaskGraph): TaskGraph {
  return {
    ...graph,
    nodes: propagateAskStatus(
      graph.nodes.map((n) =>
        (n.kind === "RESEARCH" ||
          n.kind === "RETRIEVE" ||
          n.kind === "FETCH_URL") &&
        n.status === "PENDING"
          ? { ...n, status: "RUNNING" as const }
          : n,
      ),
    ),
  };
}

/** Map graph retrieval nodes to UI checklist items. */
export function researchProgressItems(
  graph: TaskGraph,
): Array<{ id: string; label: string; status: "done" | "active" | "pending" }> {
  return graph.nodes
    .filter(
      (n) =>
        n.kind === "RESEARCH" ||
        n.kind === "RETRIEVE" ||
        n.kind === "FETCH_URL" ||
        n.kind === "SUMMARIZE_SITE",
    )
    .map((n) => ({
      id: n.id,
      label: n.label,
      status:
        n.status === "SUCCEEDED" || n.status === "SKIPPED_BY_CONDITION"
          ? ("done" as const)
          : n.status === "RUNNING"
            ? ("active" as const)
            : ("pending" as const),
    }));
}

export function applyCompletionToGraph(
  graph: TaskGraph,
  unresolved: string[],
): TaskGraph {
  const nodes = graph.nodes.map((n) => {
    if (n.kind !== "RESEARCH" && n.kind !== "RETRIEVE" && n.kind !== "FETCH_URL") {
      return n;
    }
    if (unresolved.includes(n.id) || unresolved.includes(n.subtaskId ?? "")) {
      return { ...n, status: "UNRESOLVED" as const, terminalReason: "evidence_insufficient" };
    }
    if (n.status === "RUNNING" || n.status === "PENDING" || n.status === "READY") {
      return { ...n, status: "SUCCEEDED" as const };
    }
    return n;
  });
  return { ...graph, nodes: propagateAskStatus(nodes) };
}

export function blockDownstreamTasks(graph: TaskGraph, failedNodeId: string): TaskGraph {
  const failed = new Set<string>([failedNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of graph.nodes) {
      if (n.status !== "PENDING" && n.status !== "READY") continue;
      const deps = n.dependsOn ?? [];
      if (deps.some((d) => failed.has(d)) && !failed.has(n.id)) {
        failed.add(n.id);
        changed = true;
      }
    }
  }
  return {
    ...graph,
    nodes: propagateAskStatus(
      graph.nodes.map((n) =>
        failed.has(n.id) && n.id !== failedNodeId && (n.status === "PENDING" || n.status === "READY")
          ? {
              ...n,
              status: "BLOCKED_UPSTREAM_FAILED" as const,
              terminalReason: "upstream_failed",
            }
          : n,
      ),
    ),
  };
}
