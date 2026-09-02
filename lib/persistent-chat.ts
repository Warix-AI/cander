import type { Message, SpaceId, Thread } from "./types";

export function spaceChatId(workspaceId: string, spaceId: SpaceId) {
  return `t-space-${workspaceId}-${spaceId}`;
}

export function projectChatId(workspaceId: string, projectId: string) {
  return `t-project-${workspaceId}-${projectId}`;
}

/** Active continuous session for a workspace (not per-space). */
export function continuousChatId(workspaceId: string) {
  return `t-session-${workspaceId}`;
}

export function threadHasTurns(thread: Thread | null | undefined) {
  return Boolean(
    thread?.messages.some(
      (message) => message.role === "user" || message.role === "assistant",
    ),
  );
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
    updatedAt: new Date().toISOString(),
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

/** True when this thread is the shared default across Work / Build / Explore. */
export function isUniversalDefaultChat(
  thread: Thread | null | undefined,
  workspaceId: string,
) {
  return Boolean(
    thread &&
      thread.workspaceId === workspaceId &&
      !thread.projectId &&
      thread.id === continuousChatId(workspaceId),
  );
}

/**
 * True when opening from Recents should restore a space/project panel.
 * Detached "New chat" sessions are not attached.
 */
export function isSpaceAttachedChat(
  thread: Thread | null | undefined,
  workspaceId: string,
) {
  if (!thread || thread.workspaceId !== workspaceId) return false;
  if (thread.projectId) return true;
  if (isUniversalDefaultChat(thread, workspaceId)) return true;
  if (thread.id.startsWith(`t-space-${workspaceId}-`)) return true;
  return false;
}

/**
 * Load (or create) the shared default chat for dock spaces.
 * All spaces resume the same `t-session-{workspaceId}` thread.
 */
export function openSpaceDefaultChat(
  threads: Thread[],
  workspaceId: string,
  spaceId: SpaceId,
): { threads: Thread[]; id: string } {
  const defaultId = continuousChatId(workspaceId);
  const universal = threads.find(
    (item) => item.id === defaultId && !item.projectId,
  );
  if (universal) {
    const updated = withSpaceSwitch(universal, spaceId);
    if (updated === universal) {
      return { threads, id: universal.id };
    }
    return {
      threads: threads.map((item) =>
        item.id === universal.id ? updated : item,
      ),
      id: universal.id,
    };
  }
  const created = emptyContinuousChat(workspaceId, spaceId, defaultId);
  return { threads: [created, ...threads], id: defaultId };
}

/**
 * Promote a draft chat to the shared default used across Work, Build, Explore.
 * Replaces any prior universal / per-space dock slot for this workspace.
 */
export function adoptThreadAsUniversalDefault(
  threads: Thread[],
  workspaceId: string,
  sourceThreadId: string,
): { threads: Thread[]; id: string; removedIds: string[] } {
  const source = threads.find((item) => item.id === sourceThreadId);
  const defaultId = continuousChatId(workspaceId);
  if (!source || source.workspaceId !== workspaceId) {
    const ensured = ensureContinuousChat(threads, workspaceId, "work");
    return { ...ensured, removedIds: [] };
  }
  // Project-tied chats can still become the shared default; clear the link.
  const promoted: Thread = {
    ...source,
    id: defaultId,
    spaceId: source.spaceId && source.spaceId !== "home" ? source.spaceId : "work",
    persistent: true,
    projectId: undefined,
    updatedAt: new Date().toISOString(),
  };
  const removeIds = new Set<string>([
    sourceThreadId,
    defaultId,
    spaceChatId(workspaceId, "work"),
    spaceChatId(workspaceId, "build"),
    spaceChatId(workspaceId, "research"),
    spaceChatId(workspaceId, "home"),
  ]);
  const removedIds = threads
    .filter((item) => removeIds.has(item.id) && item.id !== sourceThreadId)
    .map((item) => item.id);
  if (sourceThreadId !== defaultId) removedIds.push(sourceThreadId);
  const rest = threads.filter((item) => !removeIds.has(item.id));
  return { threads: [promoted, ...rest], id: defaultId, removedIds };
}

/**
 * Promote a draft / session thread to the persistent default for a space.
 * The old default slot is replaced; the source row is removed when ids differ.
 */
export function adoptThreadAsSpaceDefault(
  threads: Thread[],
  workspaceId: string,
  spaceId: SpaceId,
  sourceThreadId: string,
): { threads: Thread[]; id: string } {
  const source = threads.find((item) => item.id === sourceThreadId);
  if (!source || source.workspaceId !== workspaceId || source.projectId) {
    return openSpaceDefaultChat(threads, workspaceId, spaceId);
  }
  const defaultId = spaceChatId(workspaceId, spaceId);
  const promoted: Thread = {
    ...source,
    id: defaultId,
    spaceId,
    persistent: true,
    projectId: undefined,
  };
  const rest = threads.filter(
    (item) => item.id !== defaultId && item.id !== sourceThreadId,
  );
  return { threads: [promoted, ...rest], id: defaultId };
}

export function findPersistentProjectThread(
  threads: Thread[],
  workspaceId: string,
  projectId: string,
) {
  const id = projectChatId(workspaceId, projectId);
  return (
    threads.find((item) => item.id === id) ??
    threads.find(
      (item) =>
        item.persistent &&
        item.workspaceId === workspaceId &&
        item.projectId === projectId,
    ) ??
    null
  );
}

export function emptyPersistentProjectThread(
  workspaceId: string,
  projectId: string,
  spaceId: SpaceId,
): Thread {
  return {
    id: projectChatId(workspaceId, projectId),
    title: "Chat",
    workspaceId,
    projectId,
    spaceId,
    updatedAt: new Date().toISOString(),
    snippet: "",
    messages: [],
    persistent: true,
    sessionSummary: null,
  };
}

export function upsertPersistentProjectThread(
  threads: Thread[],
  workspaceId: string,
  projectId: string,
  spaceId: SpaceId,
): { threads: Thread[]; id: string } {
  const found = findPersistentProjectThread(threads, workspaceId, projectId);
  if (found) {
    if (found.spaceId === spaceId) return { threads, id: found.id };
    return {
      threads: threads.map((item) =>
        item.id === found.id ? { ...item, spaceId } : item,
      ),
      id: found.id,
    };
  }
  const created = emptyPersistentProjectThread(workspaceId, projectId, spaceId);
  return { threads: [created, ...threads], id: created.id };
}

function isContinuousThread(thread: Thread, workspaceId: string) {
  return (
    Boolean(thread.persistent) &&
    thread.workspaceId === workspaceId &&
    !thread.projectId &&
    thread.id === continuousChatId(workspaceId)
  );
}

/** Detached New Chat session — not the shared spaces default. */
export function isDetachedSessionChat(
  thread: Thread | null | undefined,
  workspaceId: string,
) {
  return Boolean(
    thread &&
      thread.workspaceId === workspaceId &&
      !thread.projectId &&
      thread.id.startsWith(`t-session-${workspaceId}-`) &&
      thread.id !== continuousChatId(workspaceId),
  );
}

export function findContinuousChat(
  threads: Thread[],
  workspaceId: string,
  preferredId?: string | null,
) {
  if (preferredId) {
    // Keep the shared default or an explicit preferred non-project chat.
    // Never treat a detached New Chat draft as the universal slot.
    const preferred = threads.find(
      (item) =>
        item.id === preferredId &&
        item.workspaceId === workspaceId &&
        !item.projectId &&
        !isDetachedSessionChat(item, workspaceId),
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
  spaceId?: SpaceId | null,
  id = continuousChatId(workspaceId),
): Thread {
  return {
    id,
    title: "Chat",
    workspaceId,
    ...(spaceId ? { spaceId } : {}),
    updatedAt: new Date().toISOString(),
    snippet: "",
    messages: [],
    persistent: true,
    sessionSummary: null,
  };
}

export function withSpaceSwitch(thread: Thread, nextSpace: SpaceId): Thread {
  if (thread.spaceId === nextSpace) return thread;
  return { ...thread, spaceId: nextSpace };
}

/**
 * Resume (or create) one continuous workspace chat when moving between spaces.
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

/** Start a brand-new continuous session (New Chat). Unattached until Default chat. */
export function startContinuousChat(
  threads: Thread[],
  workspaceId: string,
  spaceId: SpaceId | null,
): { threads: Thread[]; id: string } {
  const id = `t-session-${workspaceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const created = emptyContinuousChat(workspaceId, spaceId, id);
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
