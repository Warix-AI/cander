"use client";

/**
 * Per-thread clarification card state (composer-adjacent, not modal).
 */

import {
  createClarificationCard,
  type ClarificationCard,
  type ClarificationQuestion,
  type ClarificationSubmitResult,
  validateAllClarificationAnswers,
  validateClarificationStep,
} from "@/lib/ai/clarification/schema";

type Listener = () => void;

const listeners = new Set<Listener>();
/** Active card keyed by threadId — at most one active card per thread. */
let byThread = new Map<string, ClarificationCard>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeClarificationStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getClarificationSnapshot(): Map<string, ClarificationCard> {
  return byThread;
}

export function getActiveClarification(
  threadId: string | null | undefined,
): ClarificationCard | null {
  if (!threadId) return null;
  const card = byThread.get(threadId);
  return card?.status === "active" ? card : null;
}

export function openClarificationCard(input: {
  threadId: string;
  title: string;
  description?: string;
  questions: ClarificationQuestion[];
  resumeTool?: string;
  resumeArguments?: Record<string, unknown>;
}): ClarificationCard {
  const card = createClarificationCard(input);
  byThread = new Map(byThread);
  byThread.set(input.threadId, card);
  emit();
  return card;
}

export function patchClarificationAnswers(
  threadId: string,
  patch: Record<string, unknown>,
) {
  const current = byThread.get(threadId);
  if (!current || current.status !== "active") return;
  byThread = new Map(byThread);
  byThread.set(threadId, {
    ...current,
    answers: { ...current.answers, ...patch },
    errors: Object.fromEntries(
      Object.entries(current.errors).filter(([k]) => !(k in patch)),
    ),
  });
  emit();
}

export function setClarificationStep(threadId: string, stepIndex: number) {
  const current = byThread.get(threadId);
  if (!current || current.status !== "active") return false;
  const max = Math.max(0, current.questions.length - 1);
  const next = Math.min(max, Math.max(0, stepIndex));
  byThread = new Map(byThread);
  byThread.set(threadId, { ...current, stepIndex: next, errors: {} });
  emit();
  return true;
}

export function clarificationNext(threadId: string): boolean {
  const current = byThread.get(threadId);
  if (!current || current.status !== "active") return false;
  const q = current.questions[current.stepIndex];
  if (!q) return false;
  const errors = validateClarificationStep(current, [q.id]);
  if (Object.keys(errors).length) {
    byThread = new Map(byThread);
    byThread.set(threadId, { ...current, errors });
    emit();
    return false;
  }
  if (current.stepIndex >= current.questions.length - 1) return true;
  return setClarificationStep(threadId, current.stepIndex + 1);
}

export function clarificationBack(threadId: string) {
  const current = byThread.get(threadId);
  if (!current || current.status !== "active") return;
  setClarificationStep(threadId, current.stepIndex - 1);
}

export function submitClarification(
  threadId: string,
  opts?: { skipRemaining?: boolean },
): ClarificationSubmitResult | null {
  const current = byThread.get(threadId);
  if (!current || current.status !== "active") return null;

  if (!opts?.skipRemaining) {
    const errors = validateAllClarificationAnswers(current);
    if (Object.keys(errors).length) {
      byThread = new Map(byThread);
      byThread.set(threadId, { ...current, errors });
      emit();
      return null;
    }
  } else {
    // Only enforce required fields already visited or all required.
    const errors = validateAllClarificationAnswers({
      ...current,
      questions: current.questions.filter((q) => q.required !== false),
    });
    // Allow skip of optional; still require required.
    if (Object.keys(errors).length) {
      byThread = new Map(byThread);
      byThread.set(threadId, { ...current, errors });
      emit();
      return null;
    }
  }

  const result: ClarificationSubmitResult = {
    cardId: current.id,
    title: current.title,
    answers: { ...current.answers },
    skipped: Boolean(opts?.skipRemaining),
    resumeTool: current.resumeTool,
    resumeArguments: current.resumeArguments,
  };
  byThread = new Map(byThread);
  byThread.set(threadId, { ...current, status: "submitted", errors: {} });
  emit();
  return result;
}

export function cancelClarification(threadId: string) {
  const current = byThread.get(threadId);
  if (!current) return;
  byThread = new Map(byThread);
  byThread.set(threadId, { ...current, status: "cancelled" });
  emit();
}

export function clearClarification(threadId: string) {
  if (!byThread.has(threadId)) return;
  byThread = new Map(byThread);
  byThread.delete(threadId);
  emit();
}

/** Test helper */
export function resetClarificationStore() {
  byThread = new Map();
  emit();
}
