import { discoveryCatalog, discoveryItemById } from "./discovery-catalog";
import type {
  DiscoveryContext,
  DiscoveryHistoryEntry,
  DiscoveryItem,
  DiscoveryState,
  DiscoveryStatus,
} from "./discovery-types";
import { isConnectorInstalled } from "./connector-install";
import { connectors } from "./data";

type Listener = () => void;

const STORAGE_KEY = "courier-discovery-v1";
const listeners = new Set<Listener>();
let state: DiscoveryState = emptyState();
let hydrated = false;

const EMPTY_STATE: DiscoveryState = {
  dailyDiscoveryItem: null,
  dailyDiscoveryDate: null,
  dailyModalShownDate: null,
  history: {},
  completedKeys: [],
};

function emptyState(): DiscoveryState {
  return {
    dailyDiscoveryItem: null,
    dailyDiscoveryDate: null,
    dailyModalShownDate: null,
    history: {},
    completedKeys: [],
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parse(raw: string | null): DiscoveryState {
  if (!raw) return emptyState();
  try {
    const data = JSON.parse(raw) as Partial<DiscoveryState>;
    return {
      dailyDiscoveryItem:
        typeof data.dailyDiscoveryItem === "string"
          ? data.dailyDiscoveryItem
          : null,
      dailyDiscoveryDate:
        typeof data.dailyDiscoveryDate === "string"
          ? data.dailyDiscoveryDate
          : null,
      dailyModalShownDate:
        typeof data.dailyModalShownDate === "string"
          ? data.dailyModalShownDate
          : null,
      history:
        data.history && typeof data.history === "object" ? data.history : {},
      completedKeys: Array.isArray(data.completedKeys)
        ? data.completedKeys.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return emptyState();
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = parse(window.localStorage.getItem(STORAGE_KEY));
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emit();
}

export function subscribeDiscovery(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDiscoverySnapshot(): DiscoveryState {
  hydrate();
  return state;
}

export function getDiscoveryServerSnapshot(): DiscoveryState {
  return EMPTY_STATE;
}

function connectorConnected(id: string) {
  const seed = connectors.find((item) => item.id === id);
  return isConnectorInstalled(id) || Boolean(seed?.installed);
}

function isCompleted(item: DiscoveryItem, ctx: DiscoveryContext, store: DiscoveryState) {
  const entry = store.history[item.id];
  if (
    entry &&
    (entry.status === "completed" ||
      entry.status === "tried" ||
      entry.status === "already_used")
  ) {
    return true;
  }
  if (item.completionKey && store.completedKeys.includes(item.completionKey)) {
    return true;
  }
  if (item.requiredConnector && connectorConnected(item.requiredConnector)) {
    return true;
  }
  if (
    item.completionKey?.startsWith("connector:") &&
    connectorConnected(item.completionKey.slice("connector:".length))
  ) {
    return true;
  }
  if (
    item.requiredSpace &&
    ctx.visitedSpaces.includes(item.requiredSpace) &&
    item.completionKey?.startsWith("space:")
  ) {
    // Visited alone isn't completed for spaces — only explicit completionKey mark.
  }
  void ctx;
  return false;
}

function recentlyDismissed(item: DiscoveryItem, store: DiscoveryState) {
  const entry = store.history[item.id];
  if (!entry || entry.status !== "dismissed") return false;
  const cooldown = item.cooldownDays ?? 7;
  const then = Date.parse(entry.updatedAt);
  if (Number.isNaN(then)) return true;
  const days = (Date.now() - then) / (1000 * 60 * 60 * 24);
  return days < cooldown;
}

function scoreItem(item: DiscoveryItem, ctx: DiscoveryContext, store: DiscoveryState) {
  if (isCompleted(item, ctx, store)) return -1;
  if (recentlyDismissed(item, store)) return -1;
  if (item.requiredPlan && !item.requiredPlan.includes(ctx.billingPlan)) {
    return -1;
  }

  let score = item.priority;

  // New users: boost connectors heavily.
  const connectedCount = connectors.filter((c) => connectorConnected(c.id)).length;
  if (item.category === "connector" && connectedCount < 4) {
    score += 18;
  }

  // Prefer unused spaces.
  if (
    item.requiredSpace &&
    !ctx.visitedSpaces.includes(item.requiredSpace)
  ) {
    score += 8;
  }

  // Soft-penalize items shown before.
  const entry = store.history[item.id];
  if (entry?.status === "shown" || entry?.status === "opened") {
    score -= 12;
  }

  // Slight variety: prefer non-connector once a few connectors are done.
  if (item.category !== "connector" && connectedCount >= 2) {
    score += 6;
  }

  return score;
}

export function rankDiscoveryItems(
  ctx: DiscoveryContext,
  store: DiscoveryState = getDiscoverySnapshot(),
): DiscoveryItem[] {
  return discoveryCatalog
    .map((item) => ({ item, score: scoreItem(item, ctx, store) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.item);
}

export function peekDailyDiscovery(ctx: DiscoveryContext): DiscoveryItem | null {
  hydrate();
  const today = todayKey();
  if (state.dailyDiscoveryDate === today && state.dailyDiscoveryItem) {
    const existing = discoveryItemById(state.dailyDiscoveryItem);
    if (existing && !isCompleted(existing, ctx, state)) {
      return existing;
    }
  }
  return rankDiscoveryItems(ctx, state)[0] ?? null;
}

export function ensureDailyDiscovery(ctx: DiscoveryContext): DiscoveryItem | null {
  hydrate();
  const today = todayKey();
  if (state.dailyDiscoveryDate === today) {
    if (state.dailyDiscoveryItem) {
      const existing = discoveryItemById(state.dailyDiscoveryItem);
      if (existing && !isCompleted(existing, ctx, state)) {
        return existing;
      }
    } else {
      // Already resolved to "no item" for today — do not re-persist.
      return null;
    }
  }

  const ranked = rankDiscoveryItems(ctx, state);
  const next = ranked[0] ?? null;
  const nextId = next?.id ?? null;
  if (
    state.dailyDiscoveryDate === today &&
    state.dailyDiscoveryItem === nextId
  ) {
    return next;
  }

  state = {
    ...state,
    dailyDiscoveryDate: today,
    dailyDiscoveryItem: nextId,
  };
  if (next) {
    const prev = state.history[next.id];
    if (!prev || prev.status === "unseen") {
      state = {
        ...state,
        history: {
          ...state.history,
          [next.id]: {
            id: next.id,
            status: "shown",
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }
  }
  persist();
  return next;
}

export function getDailyDiscoveryItem(ctx: DiscoveryContext) {
  return peekDailyDiscovery(ctx);
}

export function shouldOfferDailyModal() {
  hydrate();
  const today = todayKey();
  return state.dailyModalShownDate !== today;
}

export function markDailyModalShown() {
  hydrate();
  state = { ...state, dailyModalShownDate: todayKey() };
  persist();
}

export function setDiscoveryStatus(id: string, status: DiscoveryStatus) {
  hydrate();
  const item = discoveryItemById(id);
  const nextHistory: DiscoveryHistoryEntry = {
    id,
    status,
    updatedAt: new Date().toISOString(),
  };
  let completedKeys = state.completedKeys;
  if (
    item?.completionKey &&
    (status === "completed" || status === "tried" || status === "already_used")
  ) {
    if (!completedKeys.includes(item.completionKey)) {
      completedKeys = [...completedKeys, item.completionKey];
    }
  }
  state = {
    ...state,
    history: { ...state.history, [id]: nextHistory },
    completedKeys,
  };
  persist();
}

export function markDiscoveryOpened(id: string) {
  const current = getDiscoverySnapshot().history[id]?.status;
  if (current === "completed" || current === "tried" || current === "already_used") {
    return;
  }
  setDiscoveryStatus(id, "opened");
}

export function markDiscoveryDismissed(id: string) {
  setDiscoveryStatus(id, "dismissed");
}

export function markDiscoveryTried(id: string) {
  setDiscoveryStatus(id, "tried");
}

export function markDiscoveryCompleted(id: string) {
  setDiscoveryStatus(id, "completed");
}

export function searchDiscovery(query: string, ctx: DiscoveryContext) {
  const q = query.trim().toLowerCase();
  const ranked = rankDiscoveryItems(ctx);
  if (!q) return ranked;
  return ranked.filter((item) => {
    const hay = [
      item.title,
      item.shortLabel,
      item.description,
      item.category,
      ...item.tags,
      item.badge ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function itemsForSection(
  section: DiscoveryItem["sections"][number],
  ctx: DiscoveryContext,
) {
  return rankDiscoveryItems(ctx).filter((item) => item.sections.includes(section));
}
