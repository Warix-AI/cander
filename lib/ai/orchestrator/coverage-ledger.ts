/**
 * Coverage ledger — gate synthesis until every task is terminal (v4 TaskGraph refactor).
 */

import {
  executableNodes,
  isTerminalStatus,
  type TaskGraph,
  type TaskNode,
} from "./task-graph.ts";

export type CoverageStatus =
  | "SUCCEEDED"
  | "SKIPPED_BY_CONDITION"
  | "UNRESOLVED"
  | "FAILED"
  | "BLOCKED_UPSTREAM_FAILED";

export type CoverageResult = {
  readyForSynthesis: boolean;
  unresolvedAsks: TaskNode[];
  succeededAsks: TaskNode[];
  terminal: Record<string, CoverageStatus>;
  partialMessage?: string;
};

function toCoverageStatus(status: TaskNode["status"]): CoverageStatus {
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "SKIPPED_BY_CONDITION") return "SKIPPED_BY_CONDITION";
  if (status === "BLOCKED_UPSTREAM_FAILED") return "BLOCKED_UPSTREAM_FAILED";
  if (status === "FAILED") return "FAILED";
  return "UNRESOLVED";
}

export function evaluateCoverage(graph: TaskGraph): CoverageResult {
  const retrieval = executableNodes(graph);
  const terminal: Record<string, CoverageStatus> = {};
  for (const n of graph.nodes) {
    if (n.kind === "ASK" || n.kind === "RETRIEVE" || n.kind === "RESEARCH") {
      terminal[n.id] = toCoverageStatus(n.status);
    }
  }

  const allRetrievalTerminal =
    retrieval.length === 0 || retrieval.every((n) => isTerminalStatus(n.status));

  const askNodes = graph.nodes.filter((n) => n.kind === "ASK");
  const unresolvedAsks = askNodes.filter(
    (a) => a.status === "UNRESOLVED" || a.status === "FAILED" || a.status === "PENDING",
  );
  const succeededAsks = askNodes.filter((a) => a.status === "SUCCEEDED");

  const readyForSynthesis = allRetrievalTerminal && askNodes.every((a) => isTerminalStatus(a.status));

  let partialMessage: string | undefined;
  if (unresolvedAsks.length) {
    const labels = unresolvedAsks.map((a) => a.label).join("; ");
    partialMessage = `I couldn't fully verify everything you asked (still unresolved: ${labels}). Here's what I could confirm:`;
  }

  return {
    readyForSynthesis,
    unresolvedAsks,
    succeededAsks,
    terminal,
    partialMessage,
  };
}

export function buildPartialAnswerPrefix(coverage: CoverageResult): string {
  if (!coverage.partialMessage) return "";
  return coverage.partialMessage;
}

export function shouldBlockSynthesis(coverage: CoverageResult): boolean {
  const retrieval = Object.entries(coverage.terminal).filter(([id]) =>
    id.startsWith("retrieve_") || id.startsWith("st_") || id === "retrieve_primary",
  );
  if (!retrieval.length) return false;
  const allFailed = retrieval.every(
    ([, s]) => s === "FAILED" || s === "BLOCKED_UPSTREAM_FAILED",
  );
  return allFailed;
}
