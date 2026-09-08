/**
 * Canonical turn activity — one phase, one timer, one visible status row.
 * All chat surfaces should render from this (not stacked Thinking + detail).
 */

import type { AgentTurnProgress } from "./runtime/agent-turn.ts";
import type { Message } from "@/lib/types";
import { labelForAgentTool } from "@/lib/ai/agents/labels";

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

/** Default detail when a provider has not supplied a more specific event. */
export function detailForPhase(phase: TurnActivityPhase): string {
  switch (phase) {
    case "generating":
      return "Thinking";
    case "searching":
      return "Searching the web";
    case "reading":
      return "Reading relevant sources";
    case "checking":
      return "Checking the results";
    case "building":
      return "Building your request";
    case "updating":
      return "Applying the changes";
  }
}

function friendlyProgressDetail(
  progress: AgentTurnProgress,
  phase: TurnActivityPhase,
): string {
  const detail = progress.detail?.trim();
  if (
    detail &&
    !/^(thinking|generating|searching|reading|checking|building|updating|starting agent)\.?\.?\.?$/i.test(
      detail,
    )
  ) {
    return detail.replace(/\s*[.…]+$/u, "").trim();
  }
  return detailForPhase(phase);
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
  if (n.startsWith("agent.")) {
    if (n.includes("get") || n.includes("validate")) return "checking";
    if (n.includes("add") || n.includes("step")) return "building";
    return "updating";
  }
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

/** Patch assistant message activity + optional research checklist / agent tool blocks. */
export function patchMessageWithProgress(
  message: Message,
  progress: AgentTurnProgress,
): Message {
  const phase = phaseFromProgress(progress);
  const startedAt = message.activity?.startedAt ?? Date.now();
  let blocks = message.blocks;

  if (progress.researchTasks && progress.researchTasks.length >= 2) {
    blocks = [
      {
        type: "build" as const,
        title: "Researching",
        items: progress.researchTasks.map((t) => ({
          id: t.id,
          label: t.label,
          status: t.status,
        })),
      },
    ];
  } else if (
    progress.toolName?.startsWith("agent.") &&
    (progress.phase === "tool" || progress.phase === "follow_up")
  ) {
    const toolName = progress.toolName;
    const existing = Array.isArray(blocks) ? [...blocks] : [];
    const idx = existing.findIndex(
      (b) => b.type === "tool" && b.detail === toolName,
    );
    const prevLabel =
      idx >= 0 && existing[idx]?.type === "tool"
        ? existing[idx].label
        : labelForAgentTool(toolName);
    const label =
      progress.phase === "tool"
        ? progress.detail && progress.detail !== "Reading"
          ? progress.detail
          : labelForAgentTool(toolName)
        : prevLabel;
    const status =
      progress.phase === "tool"
        ? ("running" as const)
        : progress.toolOk === false
          ? ("error" as const)
          : ("done" as const);
    const toolBlock = {
      type: "tool" as const,
      label,
      status,
      detail: toolName,
    };
    if (idx >= 0) {
      existing[idx] = toolBlock;
    } else {
      existing.push(toolBlock);
    }
    blocks = existing;
  }

  return {
    ...message,
    ...(progress.contentDelta
      ? { content: progress.contentDelta, status: "streaming" as const }
      : {}),
    activity: progress.contentDelta
      ? null
      : {
          phase,
          startedAt,
          detail: friendlyProgressDetail(progress, phase),
          kind: progress.phase === "tool" ? ("tool" as const) : ("work" as const),
        },
    blocks,
  };
}
