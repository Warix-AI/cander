import type { Message, PlatformNav, SpaceId, Thread } from "./types";

export function spaceChatId(workspaceId: string, spaceId: SpaceId) {
  return `t-space-${workspaceId}-${spaceId}`;
}

export function platformChatId(workspaceId: string, nav: PlatformNav) {
  return `t-plat-${workspaceId}-${nav}`;
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
        item.product !== "platform" &&
        item.workspaceId === workspaceId &&
        item.spaceId === spaceId &&
        !item.projectId,
    ) ??
    null
  );
}

export function findPersistentPlatformThread(
  threads: Thread[],
  workspaceId: string,
  nav: PlatformNav,
) {
  const id = platformChatId(workspaceId, nav);
  return (
    threads.find((item) => item.id === id) ??
    threads.find(
      (item) =>
        item.persistent &&
        item.product === "platform" &&
        item.workspaceId === workspaceId &&
        item.platformNav === nav,
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
    product: "courier",
    spaceId,
    updatedAt: "Just now",
    snippet: "",
    messages: [],
    persistent: true,
    sessionSummary: null,
  };
}

export function emptyPersistentPlatformThread(
  workspaceId: string,
  nav: PlatformNav,
): Thread {
  return {
    id: platformChatId(workspaceId, nav),
    title: "Chat",
    workspaceId,
    product: "platform",
    platformNav: nav,
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

export function upsertPersistentPlatformThread(
  threads: Thread[],
  workspaceId: string,
  nav: PlatformNav,
): { threads: Thread[]; id: string } {
  const found = findPersistentPlatformThread(threads, workspaceId, nav);
  if (found) return { threads, id: found.id };
  const created = emptyPersistentPlatformThread(workspaceId, nav);
  return { threads: [created, ...threads], id: created.id };
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
