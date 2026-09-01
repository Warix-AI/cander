import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

const STORAGE_KEY = "courier-home-dock-chat";

type HomeDockChatPrefs = Record<string, boolean>;

function readAll(): HomeDockChatPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as HomeDockChatPrefs;
  } catch {
    return {};
  }
}

/** Whether Home split chat was left open for this workspace. */
export function readHomeDockChatOpen(workspaceId: string): boolean {
  return Boolean(readAll()[workspaceId]);
}

export function writeHomeDockChatOpen(workspaceId: string, open: boolean) {
  const next = { ...readAll(), [workspaceId]: open };
  safeLocalStorageSetItem(STORAGE_KEY, JSON.stringify(next));
}
