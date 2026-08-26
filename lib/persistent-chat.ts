import type { Message, SpaceId, Thread } from "./types";

export function spaceChatId(workspaceId: string, spaceId: SpaceId) {
  return `t-space-${workspaceId}-${spaceId}`;
}

/** Active continuous session for a workspace (not per-space). */
export function continuousChatId(workspaceId: string) {
  return `t-session-${workspaceId}`;
}

export function findPersistentSpaceThread(
  threads: Thread[],
  workspaceId: string,
  spaceId: SpaceId,
) {
  const id = spaceChatId(workspaceId, spaceId);
  return (
    threads.find((item) => item.id === id) ??
    threads.find(
      (item) =>
        item.persistent &&
        item.workspaceId === workspaceId &&
        item.spaceId === spaceId &&
        !item.projectId,
    ) ??
    null
  );
}

export function emptyPersistentSpaceThread(
  workspaceId: string,
  spaceId: SpaceId,
): Thread {
  return {
    id: spaceChatId(workspaceId, spaceId),
    title: "Chat",
    workspaceId,
    spaceId,
    updatedAt: "Just now",
    snippet: "",
    messages: [],
    persistent: true,
    sessionSummary: null,
  };
}

export function upsertPersistentSpaceThread(
  threads: Thread[],
  workspaceId: string,
  spaceId: SpaceId,
): { threads: Thread[]; id: string } {
  const found = findPersistentSpaceThread(threads, workspaceId, spaceId);
  if (found) return { threads, id: found.id };
  const created = emptyPersistentSpaceThread(workspaceId, spaceId);
  return { threads: [created, ...threads], id: created.id };
}

function isContinuousThread(thread: Thread, workspaceId: string) {
  return (
    Boolean(thread.persistent) &&
    thread.workspaceId === workspaceId &&
    !thread.projectId &&
    (thread.id === continuousChatId(workspaceId) ||
      thread.id.startsWith(`t-session-${workspaceId}`))
  );
}

export function findContinuousChat(
  threads: Thread[],
  workspaceId: string,
  preferredId?: string | null,
) {
  if (preferredId) {
    const preferred = threads.find(
      (item) => item.id === preferredId && isContinuousThread(item, workspaceId),
    );
    if (preferred) return preferred;
  }
  return (
    threads.find((item) => item.id === continuousChatId(workspaceId)) ??
    threads.find((item) => isContinuousThread(item, workspaceId)) ??
    null
  );
}

export function emptyContinuousChat(
  workspaceId: string,
  spaceId: SpaceId,
  id = continuousChatId(workspaceId),
): Thread {
  return {
    id,
    title: "Chat",
    workspaceId,
    spaceId,
    updatedAt: "Just now",
    snippet: "",
    messages: [],
    persistent: true,
    sessionSummary: null,
  };
}

export function withSpaceSwitch(thread: Thread, nextSpace: SpaceId): Thread {
  const from = thread.spaceId;
  if (!from || from === nextSpace) {
    return thread.spaceId === nextSpace ? thread : { ...thread, spaceId: nextSpace };
  }
  const hasChat = thread.messages.some(
    (item) => item.role === "user" || item.role === "assistant",
  );
  if (!hasChat) {
    return { ...thread, spaceId: nextSpace };
  }
  const last = thread.messages.at(-1);
  if (last?.spaceSwitch?.to === nextSpace) {
    return { ...thread, spaceId: nextSpace };
  }
  const marker: Message = {
    id: `sw-${Date.now().toString(36)}`,
    role: "system",
    content: "",
    at: new Date().toISOString(),
    spaceSwitch: { from, to: nextSpace },
  };
  return {
    ...thread,
    spaceId: nextSpace,
    updatedAt: "Just now",
    messages: [...thread.messages, marker],
  };
}

/**
 * Resume (or create) one continuous workspace chat, appending a space-switch
 * divider when moving between spaces mid-conversation.
 */
export function ensureContinuousChat(
  threads: Thread[],
  workspaceId: string,
  spaceId: SpaceId,
  preferredId?: string | null,
): { threads: Thread[]; id: string } {
  const found = findContinuousChat(threads, workspaceId, preferredId);
  if (found) {
    const updated = withSpaceSwitch(found, spaceId);
    if (updated === found) return { threads, id: found.id };
    return {
      threads: threads.map((item) => (item.id === found.id ? updated : item)),
      id: found.id,
    };
  }
  const created = emptyContinuousChat(workspaceId, spaceId);
  return { threads: [created, ...threads], id: created.id };
}

/** Start a brand-new continuous session (New Chat). */
export function startContinuousChat(
  threads: Thread[],
  workspaceId: string,
  spaceId: SpaceId | null,
): { threads: Thread[]; id: string } {
  const id = `t-session-${workspaceId}-${Date.now().toString(36)}`;
  const created = emptyContinuousChat(
    workspaceId,
    spaceId ?? "work",
    id,
  );
  return { threads: [created, ...threads], id };
}

/** Local mock “summarize on close” — one short line from recent turns. */
export function summarizeSession(messages: Message[]): string | null {
  if (!messages.length) return null;
  const lastUser = [...messages].reverse().find((item) => item.role === "user");
  const lastAssistant = [...messages]
    .reverse()
    .find((item) => item.role === "assistant");
  const userBit = lastUser?.content?.trim().replace(/\s+/g, " ") ?? "";
  const assistantBit =
    lastAssistant?.content?.trim().replace(/\s+/g, " ") ?? "";
  if (!userBit && !assistantBit) return null;
  const raw = userBit
    ? assistantBit
      ? `${userBit} → ${assistantBit}`
      : userBit
    : assistantBit;
  return raw.length > 120 ? `${raw.slice(0, 117).trimEnd()}…` : raw;
}
