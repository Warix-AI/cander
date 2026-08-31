/**
 * Canonical turn activity — one phase, one timer, one visible status row.
 * All chat surfaces should render from this (not stacked Thinking + detail).
 */

import type { AgentTurnProgress } from "./runtime/agent-turn.ts";
import type { Message } from "@/lib/types";

export const TURN_ACTIVITY_PHASES = [
  "generating",
  "searching",
  "reading",
  "checking",
  "building",
  "updating",
] as const;

export type TurnActivityPhase = (typeof TURN_ACTIVITY_PHASES)[number];

export type TurnActivityState = {
  phase: TurnActivityPhase;
  startedAt: number;
  elapsedSeconds: number;
  isActive: boolean;
};

/** User-facing labels only — never expose tool names or orchestration jargon. */
export function labelForPhase(phase: TurnActivityPhase): string {
  switch (phase) {
    case "generating":
      return "Generating";
    case "searching":
      return "Searching";
    case "reading":
      return "Reading";
    case "checking":
      return "Checking";
    case "building":
      return "Building";
    case "updating":
      return "Updating";
  }
}

export function formatTurnActivityLine(
  state: Pick<TurnActivityState, "phase" | "elapsedSeconds">,
): string {
  return `${labelForPhase(state.phase)} · ${Math.max(0, state.elapsedSeconds)}s`;
}

export function createTurnActivityState(
  startedAt = Date.now(),
  phase: TurnActivityPhase = "generating",
): TurnActivityState {
  return {
    phase,
    startedAt,
    elapsedSeconds: 0,
    isActive: true,
  };
}

export function tickTurnActivity(
  state: TurnActivityState,
  now = Date.now(),
): TurnActivityState {
  return {
    ...state,
    elapsedSeconds: Math.max(
      0,
      Math.floor((now - state.startedAt) / 1000),
    ),
  };
}

export function withTurnActivityPhase(
  state: TurnActivityState,
  phase: TurnActivityPhase,
  now = Date.now(),
): TurnActivityState {
  return {
    ...state,
    phase,
    elapsedSeconds: Math.max(
      0,
      Math.floor((now - state.startedAt) / 1000),
    ),
    isActive: true,
  };
}

function phaseFromToolName(toolName?: string): TurnActivityPhase | null {
  if (!toolName) return null;
  const n = toolName.toLowerCase();
  if (
    n.includes("search") ||
    n.includes("research") ||
    n === "web.search" ||
    n === "web.research"
  ) {
    return "searching";
  }
  if (
    n.includes("read") ||
    n.includes("open") ||
    n.includes("observe") ||
    n.includes("capture") ||
    n.includes("selection") ||
    n.includes("get_context")
  ) {
    return "reading";
  }
  if (n.includes("project") || n.includes("build") || n.includes("nav.")) {
    return "building";
  }
  if (n.includes("confirm") || n.includes("clarification") || n.includes("check")) {
    return "checking";
  }
  if (n.includes("update") || n.includes("write") || n.includes("mutate")) {
    return "updating";
  }
  return null;
}

function phaseFromDetail(detail?: string): TurnActivityPhase | null {
  if (!detail) return null;
  const d = detail.toLowerCase();
  if (/\bsearch/.test(d)) return "searching";
  if (/\bread|source|page|browser|viewport/.test(d)) return "reading";
  if (/\bcheck|verif|validat/.test(d)) return "checking";
  if (/\bbuild|creat|navigat/.test(d)) return "building";
  if (/\bupdat|writ|sav/.test(d)) return "updating";
  if (/\bgenerat|condens|synthes/.test(d)) return "generating";
  return null;
}

/** Map orchestrator progress → calm activity phase. */
export function phaseFromProgress(progress: AgentTurnProgress): TurnActivityPhase {
  const fromTool = phaseFromToolName(progress.toolName);
  if (fromTool) return fromTool;
  const fromDetail = phaseFromDetail(progress.detail);
  if (fromDetail) return fromDetail;
  if (progress.phase === "tool") return "searching";
  if (progress.phase === "follow_up") return "reading";
  if (progress.phase === "generating") return "generating";
  return "generating";
}

export function applyProgressToTurnActivity(
  state: TurnActivityState,
  progress: AgentTurnProgress,
  now = Date.now(),
): TurnActivityState {
  return withTurnActivityPhase(state, phaseFromProgress(progress), now);
}

/** Persistable message activity — single row, timer anchored at turn start. */
export type MessageTurnActivity = {
  phase: TurnActivityPhase;
  startedAt: number;
};

/** Patch assistant message activity + optional research checklist blocks. */
export function patchMessageWithProgress(
  message: Message,
  progress: AgentTurnProgress,
): Message {
  const phase = phaseFromProgress(progress);
  const startedAt = message.activity?.startedAt ?? Date.now();
  const blocks =
    progress.researchTasks && progress.researchTasks.length >= 2
      ? [
          {
            type: "build" as const,
            title: "Researching",
            items: progress.researchTasks.map((t) => ({
              id: t.id,
              label: t.label,
              status: t.status,
            })),
          },
        ]
      : message.blocks;
  return {
    ...message,
    activity: {
      phase,
      startedAt,
      kind: progress.phase === "tool" ? ("tool" as const) : ("work" as const),
    },
    blocks,
  };
}
