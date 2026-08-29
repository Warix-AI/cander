/**
 * Per-assistant-turn context for tools (thread id can race ahead of React state).
 */

let turnThreadId: string | null = null;

export function setTurnThreadId(threadId: string | null | undefined) {
  turnThreadId = threadId?.trim() || null;
}

export function getTurnThreadId(): string | null {
  return turnThreadId;
}
