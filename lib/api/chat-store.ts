import type { Message, Thread } from "@/lib/types";
import {
  estimateThreadsJsonBytes,
  stripThreadsForLocalStorage,
} from "@/lib/chat-store-persist";
import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

const STORAGE_KEY = "courier-threads-v1";
const MAX_PERSISTED_THREADS = 40;

let ownerId: string | null = null;

function storageKey() {
  return ownerId ? `${STORAGE_KEY}:${ownerId}` : STORAGE_KEY;
}

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
  if (typeof window === "undefined" || !ownerId) return;
  const key = storageKey();
  const sanitized = stripThreadsForLocalStorage(state.threads);
  const payload = JSON.stringify(sanitized);

  try {
    if (safeLocalStorageSetItem(key, payload)) {
      return;
    }
    throw new DOMException("QuotaExceededError");
  } catch {
    // Quota full — never throw; keep in-memory state usable for typing/sending.
    try {
      const trimmed = stripThreadsForLocalStorage(
        state.threads.slice(0, MAX_PERSISTED_THREADS),
      );
      if (safeLocalStorageSetItem(key, JSON.stringify(trimmed))) {
        return;
      }
    } catch {
      /* continue */
    }

    try {
      window.localStorage.removeItem(key);
      safeLocalStorageSetItem(
        key,
        JSON.stringify(stripThreadsForLocalStorage(state.threads.slice(0, 12))),
      );
    } catch {
      /* memory only */
    }
  }
}

/** useSyncExternalStore compares snapshots with Object.is — replace state object on writes. */
function commitThreads(threads: Thread[]) {
  state = {
    ...state,
    threads,
    revision: state.revision + 1,
  };
  persistLocal();
  emit();
}

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return;
  if (!ownerId) {
    state = { ...state, hydrated: true };
    return;
  }
  const raw = window.localStorage.getItem(storageKey());
  const stored = parse(raw);
  if (stored?.length) {
    const sanitized = stripThreadsForLocalStorage(stored);
    state = {
      threads: sanitized,
      revision: state.revision + 1,
      hydrated: true,
    };
    // Rewrite stripped threads so a prior photo attach cannot keep quota full.
    if (raw && estimateThreadsJsonBytes(sanitized) < raw.length) {
      safeLocalStorageSetItem(storageKey(), JSON.stringify(sanitized));
    }
    return;
  }
  state = { ...state, hydrated: true };
}

/** Scope cached threads to the signed-in user. */
export function bindChatStoreOwner(actorId: string | undefined) {
  const next = actorId?.trim() || null;
  if (next === ownerId) return;
  ownerId = next;
  state = { threads: [], revision: state.revision + 1, hydrated: false };
  hydrate();
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

const EMPTY_CHAT_STORE: ChatStoreState = {
  threads: [],
  revision: 0,
  hydrated: true,
};

export function getChatStoreServerSnapshot(): ChatStoreState {
  return EMPTY_CHAT_STORE;
}

/** Replace in-memory threads (Supabase hydrate / import). */
export function replaceChatThreads(threads: Thread[]) {
  commitThreads(threads);
}

/** React-style updater used by AppProvider. */
export function updateChatThreads(
  updater: Thread[] | ((current: Thread[]) => Thread[]),
) {
  const next =
    typeof updater === "function"
      ? updater(state.threads)
      : updater;
  commitThreads(next);
}

export function resetChatStore() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKey());
    window.localStorage.removeItem(STORAGE_KEY);
  }
  ownerId = null;
  state = { threads: [], revision: 0, hydrated: false };
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
