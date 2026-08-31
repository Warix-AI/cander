/**
 * Drop cross-turn / cross-topic evidence that must not influence retrieval or FM.
 */

import type { TurnEvidence } from "./evidence.ts";
import type { ConversationTurnState } from "@/lib/ai/turn-environment/conversation-types.ts";
import type { TurnTaskResolution } from "@/lib/ai/turn-environment/turn-task.ts";
import type { ThreadTaskState } from "@/lib/ai/task-state.ts";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function activeLabels(
  turnTask: TurnTaskResolution,
  conv?: ConversationTurnState | null,
): string[] {
  const labels: string[] = [];
  if (turnTask.subject?.trim()) labels.push(turnTask.subject.trim());
  for (const e of conv?.entities ?? []) {
    if (e.contextClass === "ACTIVE") labels.push(e.label);
  }
  for (const t of conv?.topics ?? []) {
    if (t.contextClass === "ACTIVE") labels.push(t.label);
  }
  return [...new Set(labels)];
}

function expiredLabels(conv?: ConversationTurnState | null): string[] {
  const out: string[] = [];
  for (const e of conv?.entities ?? []) {
    if (e.contextClass === "EXPIRED") out.push(e.label);
  }
  for (const t of conv?.topics ?? []) {
    if (t.contextClass === "EXPIRED") out.push(t.label);
  }
  return out;
}

function textMatchesAnyLabel(text: string, labels: string[]): boolean {
  const lower = text.toLowerCase();
  for (const label of labels) {
    const tokens = tokenize(label);
    if (tokens.some((t) => lower.includes(t))) return true;
    if (label.length > 4 && lower.includes(label.toLowerCase().slice(0, 12))) {
      return true;
    }
  }
  return false;
}

/** Remove evidence atoms tied to expired topics when current subject differs. */
export function filterEvidenceForCurrentTurn(
  evidence: TurnEvidence[],
  opts: {
    turnTask: TurnTaskResolution;
    conversationState?: ConversationTurnState | null;
    userMessage: string;
  },
): { evidence: TurnEvidence[]; dropped: number } {
  const active = activeLabels(opts.turnTask, opts.conversationState);
  const expired = expiredLabels(opts.conversationState);
  if (!expired.length && !active.length) {
    return { evidence, dropped: 0 };
  }

  const filtered = evidence.filter((e) => {
    const blob = `${e.title} ${e.content}`.trim();
    if (!blob) return false;
    if (expired.length && textMatchesAnyLabel(blob, expired)) {
      if (!active.length || !textMatchesAnyLabel(blob, active)) return false;
    }
    if (
      active.length &&
      (e.kind === "search_result" || e.kind === "exa_synthesis") &&
      !textMatchesAnyLabel(blob, active) &&
      !textMatchesAnyLabel(blob, [opts.userMessage])
    ) {
      return false;
    }
    return true;
  });

  return { evidence: filtered, dropped: evidence.length - filtered.length };
}

export function filterMemorySnippetsForTurn(
  snippets: string[],
  opts: {
    turnTask: TurnTaskResolution;
    conversationState?: ConversationTurnState | null;
  },
): string[] {
  const active = activeLabels(opts.turnTask, opts.conversationState);
  const expired = expiredLabels(opts.conversationState);
  if (!active.length && !expired.length) return snippets;

  return snippets.filter((snippet) => {
    if (expired.length && textMatchesAnyLabel(snippet, expired)) {
      if (!active.length || !textMatchesAnyLabel(snippet, active)) return false;
    }
    if (active.length && !textMatchesAnyLabel(snippet, active)) {
      return false;
    }
    return true;
  });
}

/** Strip task facts from unrelated prior topics. */
export function filterTaskFactsForTurn(
  taskState: ThreadTaskState | null | undefined,
  opts: {
    turnTask: TurnTaskResolution;
    conversationState?: ConversationTurnState | null;
  },
): Record<string, unknown> {
  if (!taskState?.facts) return {};
  const active = activeLabels(opts.turnTask, opts.conversationState);
  const expired = expiredLabels(opts.conversationState);
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(taskState.facts)) {
    const blob = `${key} ${JSON.stringify(value)}`;
    if (expired.length && textMatchesAnyLabel(blob, expired)) {
      if (!active.length || !textMatchesAnyLabel(blob, active)) continue;
    }
    if (active.length && !textMatchesAnyLabel(blob, active)) continue;
    out[key] = value;
  }
  return out;
}
