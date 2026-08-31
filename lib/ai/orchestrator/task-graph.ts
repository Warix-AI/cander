/**
 * Task graph — compile ASK/CONSTRAINT/RESEARCH nodes from RequestLedger + ResearchTurnPlan.
 * Heuristic-first; @Generable planning is an exception path (Phase 1+).
 */

import type { RequestLedger } from "./request-scanner.ts";
import type { ResearchTurnPlan } from "@/lib/ai/turn-environment/research-turn-plan.ts";
import { bindConstraints, type BoundConstraint } from "./constraint-enforcement.ts";

export type TaskNodeStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED_BY_CONDITION"
  | "BLOCKED_UPSTREAM_FAILED";

export type TaskNodeKind = "ASK" | "RESEARCH" | "RETRIEVE" | "CONSTRAINT";

export type TaskNode = {
  id: string;
  kind: TaskNodeKind;
  label: string;
  status: TaskNodeStatus;
  subtaskId?: string;
  dependsOn?: string[];
  spanId?: string;
};

export type TaskGraph = {
  nodes: TaskNode[];
  constraints: BoundConstraint[];
  objective?: string;
};

export function compileTaskGraph(opts: {
  ledger: RequestLedger;
  researchPlan?: ResearchTurnPlan | null;
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
      });
    }
  } else if (opts.ledger.asks.length === 1) {
    nodes.push({
      id: "retrieve_primary",
      kind: "RETRIEVE",
      label: opts.ledger.asks[0]!.text.slice(0, 100),
      status: "PENDING",
      spanId: opts.ledger.asks[0]!.id,
    });
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
  };
}

export function setTaskStatus(
  graph: TaskGraph,
  nodeId: string,
  status: TaskNodeStatus,
): TaskGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === nodeId || n.subtaskId === nodeId ? { ...n, status } : n,
    ),
  };
}

export function setSubtaskStatus(
  graph: TaskGraph,
  subtaskId: string,
  status: TaskNodeStatus,
): TaskGraph {
  return setTaskStatus(graph, subtaskId, status);
}

/** Map graph research nodes to UI checklist items. */
export function researchProgressItems(
  graph: TaskGraph,
): Array<{ id: string; label: string; status: "done" | "active" | "pending" }> {
  return graph.nodes
    .filter((n) => n.kind === "RESEARCH" || n.kind === "RETRIEVE")
    .map((n) => ({
      id: n.id,
      label: n.label,
      status:
        n.status === "SUCCEEDED"
          ? ("done" as const)
          : n.status === "RUNNING"
            ? ("active" as const)
            : ("pending" as const),
    }));
}

export function markResearchNodesRunning(graph: TaskGraph): TaskGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.kind === "RESEARCH" && n.status === "PENDING"
        ? { ...n, status: "RUNNING" as const }
        : n,
    ),
  };
}

export function applyCompletionToGraph(
  graph: TaskGraph,
  unresolved: string[],
): TaskGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.kind !== "RESEARCH") return n;
      if (unresolved.includes(n.id) || unresolved.includes(n.subtaskId ?? "")) {
        return { ...n, status: "FAILED" as const };
      }
      if (n.status === "RUNNING" || n.status === "PENDING") {
        return { ...n, status: "SUCCEEDED" as const };
      }
      return n;
    }),
  };
}
