/**
 * Deterministic turn-state resolver — NOT a pseudo-AI layer.
 * Handles pending UI, yes/no, ordinals, cancel, retry, known resumes only.
 */

import type { ResolvedTurnState } from "./types.ts";

export type TurnStateInput = {
  content: string;
  taskState?: {
    status?: string;
    pendingClarification?: { resumeTool?: string } | null;
    step?: string;
    recentLists?: Array<{
      items: Array<{ ordinal: number; label: string }>;
    }>;
  } | null;
  /** Explicit UI resume payload (clarification answers already applied). */
  uiResume?: { kind: "clarification" | "confirm"; accepted?: boolean } | null;
};

const YES = /^(yes|y|yeah|yep|sure|ok|okay|do it|go ahead|confirm|proceed)[.!]?$/i;
const NO = /^(no|n|nope|cancel|never\s*mind|nevermind|stop|don'?t)[.!]?$/i;
const RETRY = /^(try again|retry|redo( it)?|again)[.!]?$/i;
const UNDO = /^(undo( that)?|revert)[.!]?$/i;

const ORDINAL =
  /\b(the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|option\s*[1-5]|#\s*[1-5]|number\s*[1-5])\b/i;

function ordinalFromText(t: string): number | null {
  const m = t.match(ORDINAL);
  if (!m) return null;
  const raw = m[2] || m[1] || "";
  const map: Record<string, number> = {
    first: 1,
    "1st": 1,
    second: 2,
    "2nd": 2,
    third: 3,
    "3rd": 3,
    fourth: 4,
    "4th": 4,
    fifth: 5,
    "5th": 5,
  };
  if (map[raw.toLowerCase()]) return map[raw.toLowerCase()]!;
  const num = raw.match(/[1-5]/);
  return num ? Number(num[0]) : null;
}

/**
 * Resolve short follow-ups against pending task/UI state.
 * Returns `handled` only when the outcome is deterministic.
 */
export function resolveTurnState(input: TurnStateInput): ResolvedTurnState {
  const content = (input.content || "").trim();
  const task = input.taskState ?? null;
  const pending =
    Boolean(task?.pendingClarification) ||
    task?.status === "awaiting_clarification" ||
    task?.step === "awaiting_confirm";

  if (input.uiResume?.kind === "clarification") {
    return {
      handled: { kind: "resume" },
      pendingKind: null,
    };
  }
  if (input.uiResume?.kind === "confirm") {
    return {
      handled: {
        kind: input.uiResume.accepted ? "confirm_yes" : "confirm_no",
      },
      pendingKind: null,
    };
  }

  if (!content) {
    return { pendingKind: pending ? "clarification" : null };
  }

  if (pending && YES.test(content)) {
    return { handled: { kind: "confirm_yes" }, pendingKind: "confirm" };
  }
  if (pending && NO.test(content)) {
    return { handled: { kind: "cancel" }, pendingKind: "confirm" };
  }
  if (RETRY.test(content)) {
    return { handled: { kind: "retry" }, pendingKind: pending ? "action" : null };
  }
  if (UNDO.test(content)) {
    return {
      handled: { kind: "cancel", content: "undo" },
      pendingKind: pending ? "action" : null,
    };
  }

  const ord = ordinalFromText(content);
  if (ord != null && (pending || task?.recentLists?.length)) {
    const list = task?.recentLists?.[0];
    const item = list?.items.find((i) => i.ordinal === ord);
    return {
      handled: {
        kind: "ordinal",
        ordinal: ord,
        selectedLabel: item?.label,
        content,
      },
      pendingKind: pending ? "clarification" : null,
    };
  }

  // Attachment deixis — flag only; context builder resolves IDs.
  if (
    /\b(the|that|this)\s+(screenshot|pdf|image|file|attachment|doc(ument)?)\b/i.test(
      content,
    )
  ) {
    return {
      attachmentRef: content,
      pendingKind: pending ? "clarification" : null,
    };
  }

  if (
    /\b(not that one|the other (one|file)|tomorrow instead|make it shorter)\b/i.test(
      content,
    )
  ) {
    return {
      correctionNote: content,
      pendingKind: pending ? "action" : null,
    };
  }

  return {
    pendingKind: pending ? "clarification" : null,
  };
}

/** Explicit deep memory search — only then expose a memory tool. */
export function wantsDeepMemorySearch(content: string): boolean {
  return (
    /\b(find|search|look\s*up)\b[\s\S]{0,40}\b(what I (said|wrote|asked)|our (chat|conversation|messages?))\b/i.test(
      content,
    ) ||
    /\b(months?|weeks?|years?)\s+ago\b/i.test(content) ||
    /\b(earlier this year|last year|three months ago)\b/i.test(content)
  );
}

export function inferDensity(content: string): "brief" | "normal" | "detailed" {
  const t = content.trim();
  if (
    /\b(just tell me|tl;?dr|briefly|in (one|1) (sentence|line)|short answer)\b/i.test(
      t,
    )
  ) {
    return "brief";
  }
  if (
    /\b(walk me through|in detail|step by step|explain fully|thorough)\b/i.test(t)
  ) {
    return "detailed";
  }
  return "normal";
}
