/**
 * Per-assistant-turn context for tools (thread id can race ahead of React state).
 */

let turnThreadId: string | null = null;
let turnWorkspaceId: string | null = null;
let turnProjectId: string | null = null;

export function setTurnContext(opts: {
  threadId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  turnThreadId = opts.threadId?.trim() || null;
  turnWorkspaceId = opts.workspaceId?.trim() || null;
  turnProjectId = opts.projectId?.trim() || null;
}

/** @deprecated Prefer setTurnContext */
export function setTurnThreadId(threadId: string | null | undefined) {
  turnThreadId = threadId?.trim() || null;
}

export function getTurnThreadId(): string | null {
  return turnThreadId;
}

export function getTurnWorkspaceId(): string | null {
  return turnWorkspaceId;
}

export function getTurnProjectId(): string | null {
  return turnProjectId;
}

export function clearTurnContext() {
  turnThreadId = null;
  turnWorkspaceId = null;
  turnProjectId = null;
}
