import type { Message, Thread } from "@/lib/types";

const STORAGE_KEY = "courier-threads-v1";

type ChatStoreState = {
  threads: Thread[];
  revision: number;
  hydrated: boolean;
};

type Listener = () => void;
const listeners = new Set<Listener>();

let state: ChatStoreState = {
  threads: [],
  revision: 0,
  hydrated: false,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): Thread[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    return data as Thread[];
  } catch {
    return null;
  }
}

function persistLocal() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.threads));
}

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return;
  state.hydrated = true;
  const stored = parse(window.localStorage.getItem(STORAGE_KEY));
  if (stored?.length) {
    state.threads = stored;
    state.revision += 1;
  }
}

export function subscribeChatStore(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getChatStoreSnapshot(): ChatStoreState {
  hydrate();
  return state;
}

export function getChatStoreServerSnapshot(): ChatStoreState {
  return { threads: [], revision: 0, hydrated: true };
}

/** Replace in-memory threads (Supabase hydrate / import). */
export function replaceChatThreads(threads: Thread[]) {
  state.threads = threads;
  state.revision += 1;
  persistLocal();
  emit();
}

/** React-style updater used by AppProvider. */
export function updateChatThreads(
  updater: Thread[] | ((current: Thread[]) => Thread[]),
) {
  const next =
    typeof updater === "function"
      ? updater(state.threads)
      : updater;
  state.threads = next;
  state.revision += 1;
  persistLocal();
  emit();
}

export function getChatThreads(): Thread[] {
  hydrate();
  return state.threads;
}

export function filterThreads(
  threads: Thread[],
  workspaceId: string,
  filter?: { spaceId?: string; projectId?: string },
) {
  return threads.filter((item) => {
    if (item.workspaceId !== workspaceId) return false;
    if (filter?.spaceId && item.spaceId !== filter.spaceId) return false;
    if (filter?.projectId && item.projectId !== filter.projectId) return false;
    return true;
  });
}

export function upsertChatThread(thread: Thread) {
  updateChatThreads((current) => {
    const index = current.findIndex((item) => item.id === thread.id);
    if (index < 0) return [thread, ...current];
    const next = [...current];
    next[index] = thread;
    return next;
  });
}
