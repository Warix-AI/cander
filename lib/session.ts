import type {
  AccountPresetId,
  HostingMode,
  Pin,
  PinKind,
  PinTier,
  SpaceId,
  Theme,
} from "@/lib/types";
import { accountPresets } from "@/lib/data";
import {
  ALL_SPACE_IDS,
  defaultSidebarLayout,
  isSidebarNavId,
  migrateSidebarId,
  NAV_SPACES,
  resolveSidebarNav,
  type SidebarLayout,
  type SidebarNavId,
  type SidebarNavOpts,
} from "@/lib/spaces";
import { isSupabaseConfigured } from "@/lib/data-backend";
import {
  clearSupabaseAuthState,
  getSupabaseAuthServerSnapshot,
  getSupabaseAuthSnapshot,
  getSupabaseUserIdServerSnapshot,
  getSupabaseUserIdSnapshot,
  subscribeSupabaseAuth,
  subscribeSupabaseUserId,
} from "@/lib/supabase/auth-store";

type Listener = () => void;

const SIDEBAR_STORAGE_VERSION = 12;

export { SIDEBAR_STORAGE_VERSION };

const workspaceListeners = new Set<Listener>();
let workspaceId = "";

function emitWorkspace() {
  workspaceListeners.forEach((listener) => listener());
}

export function subscribeWorkspace(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-workspace");
    if (
      stored &&
      !["marketing", "engineering", "operations", "solo-pro", "solo-ultra", "solo-free"].includes(
        stored,
      )
    ) {
      workspaceId = stored;
    } else if (stored) {
      window.localStorage.removeItem("courier-workspace");
      workspaceId = "";
    }
  }
  workspaceListeners.add(listener);
  return () => {
    workspaceListeners.delete(listener);
  };
}

export function getWorkspaceSnapshot() {
  return workspaceId;
}

export function getWorkspaceServerSnapshot() {
  return "";
}

export function persistWorkspace(next: string) {
  workspaceId = next;
  window.localStorage.setItem("courier-workspace", next);
  emitWorkspace();
}

/** Reset in-memory workspace selection (sign-out / user switch). */
export function resetWorkspaceSession() {
  if (workspaceId === "") return;
  workspaceId = "";
  emitWorkspace();
}

export function subscribeTheme(listener: Listener) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("storage", listener);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", listener);
  };
}

export function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function getThemeServerSnapshot(): Theme {
  return "light";
}

function syncColorSchemeMeta(next: Theme) {
  let meta = document.querySelector('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "color-scheme");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", next);

  // Prefer a single theme-color that matches the app, not OS prefers-color-scheme.
  const color = next === "dark" ? "#000000" : "#ffffff";
  const tags = document.querySelectorAll('meta[name="theme-color"]');
  if (tags.length) {
    tags.forEach((tag) => {
      tag.removeAttribute("media");
      tag.setAttribute("content", color);
    });
  } else {
    const tag = document.createElement("meta");
    tag.setAttribute("name", "theme-color");
    tag.setAttribute("content", color);
    document.head.appendChild(tag);
  }
}

export function persistTheme(next: Theme) {
  document.documentElement.classList.toggle("dark", next === "dark");
  document.documentElement.style.colorScheme = next;
  syncColorSchemeMeta(next);
  window.localStorage.setItem("theme", next);
  window.dispatchEvent(
    new CustomEvent("cander-theme", { detail: { theme: next } }),
  );
  void import("@/lib/mobile-shell")
    .then((mod) => mod.syncNativeKeyboardStyle(next))
    .catch(() => {});
}

const authListeners = new Set<Listener>();
let localSignedIn = false;

function emitAuth() {
  authListeners.forEach((listener) => listener());
}

export function subscribeAuth(listener: Listener) {
  if (isSupabaseConfigured()) {
    const unsub = subscribeSupabaseAuth(listener);
    authListeners.add(listener);
    return () => {
      unsub();
      authListeners.delete(listener);
    };
  }
  authListeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    authListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

export function getAuthSnapshot() {
  if (isSupabaseConfigured()) {
    return getSupabaseAuthSnapshot();
  }
  if (typeof window !== "undefined") {
    localSignedIn = window.localStorage.getItem("courier-signed-in") === "1";
  }
  return localSignedIn;
}

export function getAuthServerSnapshot() {
  if (isSupabaseConfigured()) {
    return getSupabaseAuthServerSnapshot();
  }
  return false;
}

/** Authenticated profile id — Supabase user id or local demo actor id. */
export function subscribeAuthUserId(listener: Listener) {
  if (isSupabaseConfigured()) {
    return subscribeSupabaseUserId(listener);
  }
  return subscribeActor(listener);
}

export function getAuthUserIdSnapshot() {
  if (isSupabaseConfigured()) {
    return getSupabaseUserIdSnapshot() ?? "local-user";
  }
  return getActorSnapshot();
}

export function getAuthUserIdServerSnapshot() {
  if (isSupabaseConfigured()) {
    return getSupabaseUserIdServerSnapshot() ?? "local-user";
  }
  return getActorServerSnapshot();
}

export function persistSignedIn() {
  if (isSupabaseConfigured()) return;
  localSignedIn = true;
  window.localStorage.setItem("courier-signed-in", "1");
  emitAuth();
}

const ONBOARDING_PENDING_KEY = "courier-onboarding-pending";
const onboardingPendingListeners = new Set<Listener>();
let onboardingPending = false;

function emitOnboardingPending() {
  onboardingPendingListeners.forEach((listener) => listener());
}

/** True while multi-step signup is in progress (survives email verify / session). */
export function subscribeOnboardingPending(listener: Listener) {
  onboardingPendingListeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    onboardingPendingListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

export function getOnboardingPendingSnapshot() {
  if (typeof window !== "undefined") {
    onboardingPending =
      window.localStorage.getItem(ONBOARDING_PENDING_KEY) === "1";
  }
  return onboardingPending;
}

export function getOnboardingPendingServerSnapshot() {
  return false;
}

export function persistOnboardingPending(pending: boolean) {
  onboardingPending = pending;
  if (typeof window === "undefined") return;
  if (pending) {
    window.localStorage.setItem(ONBOARDING_PENDING_KEY, "1");
  } else {
    window.localStorage.removeItem(ONBOARDING_PENDING_KEY);
  }
  emitOnboardingPending();
}

export function persistSignedOut() {
  if (isSupabaseConfigured()) {
    clearSupabaseAuthState();
    window.localStorage.removeItem("courier-signed-in");
    window.localStorage.removeItem("courier-actor");
  }
  localSignedIn = false;
  window.localStorage.removeItem("courier-signed-in");
  emitAuth();
}

const hostingListeners = new Set<Listener>();
let hostingMode: HostingMode = "cloud";

function emitHosting() {
  hostingListeners.forEach((listener) => listener());
}

export function subscribeHosting(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-hosting");
    if (stored === "cloud" || stored === "local" || stored === "on-device") {
      hostingMode = stored;
    }
  }
  hostingListeners.add(listener);
  return () => {
    hostingListeners.delete(listener);
  };
}

export function getHostingSnapshot() {
  return hostingMode;
}

export function getHostingServerSnapshot(): HostingMode {
  return "cloud";
}

export function persistHosting(next: HostingMode) {
  hostingMode = next;
  window.localStorage.setItem("courier-hosting", next);
  emitHosting();
}

const actorListeners = new Set<Listener>();
let actorId = "";

function emitActor() {
  actorListeners.forEach((listener) => listener());
}

export function subscribeActor(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-actor");
    // Ignore legacy demo actor ids (m1–m7 / p-*)
    if (
      stored &&
      !/^m[1-7]$/.test(stored) &&
      !stored.startsWith("p-")
    ) {
      actorId = stored;
    } else if (stored) {
      window.localStorage.removeItem("courier-actor");
      actorId = "";
    }
  }
  actorListeners.add(listener);
  return () => {
    actorListeners.delete(listener);
  };
}

export function getActorSnapshot() {
  return actorId;
}

export function getActorServerSnapshot() {
  return "";
}

export function persistActor(next: string) {
  if (!next.trim()) return;
  actorId = next;
  window.localStorage.setItem("courier-actor", next);
  emitActor();
}

export function presetIdForActor(id: string): AccountPresetId {
  return (
    accountPresets.find((item) => item.actorId === id)?.id ?? "max-owner"
  );
}

const personalSpaceListeners = new Set<Listener>();

function emitPersonalSpace() {
  personalSpaceListeners.forEach((listener) => listener());
}

/** @deprecated Personal space toggle removed — always returns true for compat. */
export function subscribePersonalSpace(listener: Listener) {
  personalSpaceListeners.add(listener);
  return () => {
    personalSpaceListeners.delete(listener);
  };
}

/** @deprecated Personal space toggle removed. */
export function getPersonalSpaceSnapshot() {
  return true;
}

/** @deprecated Personal space toggle removed. */
export function getPersonalSpaceServerSnapshot() {
  return true;
}

/** @deprecated Personal space toggle removed — no-op. */
export function persistPersonalSpace(_next: boolean) {
  emitPersonalSpace();
}

const pinListeners = new Set<Listener>();
const emptyPins: Pin[] = [];
let pins: Pin[] = emptyPins;
let pinsHydrated = false;
/** Bumped on local pin/unpin so remote hydrate cannot resurrect stale pins. */
let pinsLocalEpoch = 0;
let pinsDirty = false;
const PINS_SYNCED_FP_KEY = "courier-pins-synced-fp";

function pinsFingerprintLocal(list: Pin[]) {
  return list
    .map((pin, index) => `${pin.kind}:${pin.id}:${pin.tier}:${index}`)
    .join("|");
}

function normalizePin(item: Pin): Pin {
  return {
    kind: item.kind,
    id: item.id,
    tier: item.tier === "secondary" ? "secondary" : "primary",
  };
}

function parsePins(raw: string | null): Pin[] {
  if (!raw) return emptyPins;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return emptyPins;
    return data
      .filter(
        (item): item is Pin =>
          Boolean(item) &&
          typeof item === "object" &&
          (item.kind === "thread" ||
            item.kind === "project" ||
            item.kind === "connector") &&
          typeof item.id === "string",
      )
      .map(normalizePin);
  } catch {
    return emptyPins;
  }
}

function emitPins() {
  pinListeners.forEach((listener) => listener());
}

function hydratePins() {
  if (pinsHydrated || typeof window === "undefined") return;
  pinsHydrated = true;
  pins = parsePins(window.localStorage.getItem("courier-pins"));
  const synced = window.localStorage.getItem(PINS_SYNCED_FP_KEY) ?? "";
  const current = pinsFingerprintLocal(pins);
  // Unsynced local edits survive reload — block remote resurrect until push.
  if (synced !== current) {
    pinsDirty = true;
    pinsLocalEpoch = Math.max(pinsLocalEpoch, 1);
  }
}

export function subscribePins(listener: Listener) {
  hydratePins();
  pinListeners.add(listener);
  return () => {
    pinListeners.delete(listener);
  };
}

export function getPinsSnapshot() {
  hydratePins();
  return pins;
}

export function getPinsServerSnapshot(): Pin[] {
  return emptyPins;
}

export function getPinsLocalEpoch() {
  return pinsLocalEpoch;
}

export function arePinsDirty() {
  return pinsDirty;
}

export function markPinsSynced(epoch: number) {
  if (epoch < pinsLocalEpoch) return;
  pinsDirty = false;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PINS_SYNCED_FP_KEY,
      pinsFingerprintLocal(pins),
    );
  }
}

export function persistPins(next: Pin[]) {
  pins = next.length ? next.map(normalizePin) : emptyPins;
  pinsLocalEpoch += 1;
  pinsDirty = true;
  window.localStorage.setItem("courier-pins", JSON.stringify(pins));
  emitPins();
}

/** Replace pins (Supabase hydrate). Does not mark local dirty. */
export function replacePinsState(next: Pin[]) {
  const normalized = next.length ? next.map(normalizePin) : emptyPins;
  const same =
    normalized.length === pins.length &&
    normalized.every(
      (pin, index) =>
        pins[index]?.kind === pin.kind &&
        pins[index]?.id === pin.id &&
        pins[index]?.tier === pin.tier,
    );
  if (same) return;
  pins = normalized;
  if (typeof window !== "undefined") {
    window.localStorage.setItem("courier-pins", JSON.stringify(pins));
    window.localStorage.setItem(
      PINS_SYNCED_FP_KEY,
      pinsFingerprintLocal(pins),
    );
    pinsDirty = false;
  }
  emitPins();
}

export function pinTierOf(kind: PinKind, id: string): PinTier | null {
  hydratePins();
  const match = pins.find((item) => item.kind === kind && item.id === id);
  return match ? (match.tier === "secondary" ? "secondary" : "primary") : null;
}

/** Add or move a pin to a tier. */
export function setStoredPin(kind: PinKind, id: string, tier: PinTier) {
  hydratePins();
  const without = pins.filter(
    (item) => !(item.kind === kind && item.id === id),
  );
  persistPins([{ kind, id, tier }, ...without]);
}

export function removeStoredPin(kind: PinKind, id: string) {
  hydratePins();
  persistPins(pins.filter((item) => !(item.kind === kind && item.id === id)));
}

/** @deprecated Prefer setStoredPin / removeStoredPin — toggles primary. */
export function toggleStoredPin(kind: PinKind, id: string) {
  hydratePins();
  const exists = pins.some((item) => item.kind === kind && item.id === id);
  if (exists) removeStoredPin(kind, id);
  else setStoredPin(kind, id, "primary");
}

export function reorderStoredPins(
  from: { kind: PinKind; id: string },
  to: { kind: PinKind; id: string },
) {
  hydratePins();
  if (from.kind === to.kind && from.id === to.id) return;
  const fromIndex = pins.findIndex(
    (item) => item.kind === from.kind && item.id === from.id,
  );
  const toIndex = pins.findIndex(
    (item) => item.kind === to.kind && item.id === to.id,
  );
  if (fromIndex < 0 || toIndex < 0) return;
  const fromPin = pins[fromIndex];
  const toPin = pins[toIndex];
  if (!fromPin || !toPin) return;
  // Keep tiers aligned when reordering across lists.
  const next = [...pins];
  const [item] = next.splice(fromIndex, 1);
  const insertAt = next.findIndex(
    (row) => row.kind === to.kind && row.id === to.id,
  );
  if (insertAt < 0) return;
  next.splice(insertAt, 0, {
    ...item,
    tier: toPin.tier === "secondary" ? "secondary" : "primary",
  });
  persistPins(next);
}

const sidebarListeners = new Set<Listener>();
let sidebarLayout: SidebarLayout = defaultSidebarLayout;
let sidebarHydrated = false;

function parseNavList(value: unknown): SidebarNavId[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (id): id is SidebarNavId =>
        typeof id === "string" && isSidebarNavId(id),
    )
    .map((id) => migrateSidebarId(id))
    .filter((id): id is SidebarNavId => id !== null);
}

function migrateSidebarLayout(
  rawMain: SidebarNavId[],
  rawMore: SidebarNavId[],
): SidebarLayout {
  return resolveSidebarNav(ALL_SPACE_IDS, { main: rawMain, more: rawMore });
}

function migrateSidebarLayoutV8(
  rawMain: SidebarNavId[],
  rawMore: SidebarNavId[],
): SidebarLayout {
  const dropped = new Set(["files", "connectors", "browser"]);
  const keep = (list: SidebarNavId[]) =>
    list.filter((id) => !dropped.has(id) && id !== "work" && id !== "recents");
  return resolveSidebarNav(ALL_SPACE_IDS, {
    main: ["work", ...keep(rawMain), "recents"],
    more: keep(rawMore),
  });
}

function parseSidebar(raw: string | null): SidebarLayout {
  if (!raw) return migrateSidebarLayout([], []);
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const version = typeof data.v === "number" ? data.v : 1;

    if (Array.isArray(data.main) || Array.isArray(data.more)) {
      const main = parseNavList(data.main);
      const more = parseNavList(data.more);

      if (!main.length && !more.length) {
        return migrateSidebarLayout([], []);
      }

      if (version < 9) {
        return migrateSidebarLayoutV8(main, more);
      }

      return migrateSidebarLayout(main, more);
    }

    const order = parseNavList(data.order).filter((id) =>
      NAV_SPACES.includes(id as SpaceId),
    ) as SpaceId[];
    const hidden = parseNavList(data.hidden).filter((id) =>
      NAV_SPACES.includes(id as SpaceId),
    ) as SpaceId[];
    const ranked = [
      ...order.filter((id) => NAV_SPACES.includes(id)),
      ...NAV_SPACES.filter((id) => !order.includes(id)),
    ];
    const recentsHidden = data.recents === false;
    const tucked = hidden;
    return migrateSidebarLayoutV8(
      ranked.filter((id) => !tucked.includes(id)),
      [
        ...tucked.filter((id) => ranked.includes(id)),
        ...(recentsHidden ? [] : (["recents"] as SidebarNavId[])),
      ],
    );
  } catch {
    return migrateSidebarLayout([], []);
  }
}

function emitSidebar() {
  sidebarListeners.forEach((listener) => listener());
}

function layoutNeedsPersist(
  raw: string | null,
  storedVersion: number,
): boolean {
  if (!raw || storedVersion < SIDEBAR_STORAGE_VERSION) return true;
  try {
    const data = JSON.parse(raw) as { main?: unknown; more?: unknown; v?: number };
    const main = parseNavList(data.main);
    const more = parseNavList(data.more);
    if (!main.length && !more.length) return true;
    if (main.includes("browser" as SidebarNavId) || more.includes("browser" as SidebarNavId)) return true;
    const legacy = ["files", "skills", "scheduled", "studio", "personal", "finances", "health"];
    if (legacy.some((id) => main.includes(id as SidebarNavId) || more.includes(id as SidebarNavId))) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function hydrateSidebar() {
  if (sidebarHydrated || typeof window === "undefined") return;
  sidebarHydrated = true;
  const raw = window.localStorage.getItem("courier-sidebar");
  const parsed = parseSidebar(raw);
  sidebarLayout = parsed;

  let storedVersion = 0;
  if (raw) {
    try {
      const data = JSON.parse(raw) as { v?: number };
      storedVersion = typeof data.v === "number" ? data.v : 1;
    } catch {
      storedVersion = 0;
    }
  }

  if (layoutNeedsPersist(raw, storedVersion)) {
    persistSidebar(parsed);
  }
}

export function subscribeSidebar(listener: Listener) {
  hydrateSidebar();
  sidebarListeners.add(listener);
  return () => {
    sidebarListeners.delete(listener);
  };
}

export function getSidebarSnapshot() {
  return sidebarLayout;
}

export function getSidebarServerSnapshot(): SidebarLayout {
  return defaultSidebarLayout;
}

export function persistSidebar(next: SidebarLayout) {
  sidebarLayout = next;
  window.localStorage.setItem(
    "courier-sidebar",
    JSON.stringify({
      v: SIDEBAR_STORAGE_VERSION,
      main: next.main,
      more: next.more,
    }),
  );
  emitSidebar();
}

/** Replace sidebar layout (Supabase hydrate). */
export function replaceSidebarState(next: SidebarLayout) {
  sidebarLayout = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      "courier-sidebar",
      JSON.stringify({
        v: SIDEBAR_STORAGE_VERSION,
        main: next.main,
        more: next.more,
      }),
    );
  }
  emitSidebar();
}

export function moveSidebarNav(
  id: SidebarNavId,
  allowed: SpaceId[],
  dir: -1 | 1,
  opts?: SidebarNavOpts,
) {
  hydrateSidebar();
  const { main } = resolveSidebarNav(allowed, sidebarLayout, opts);
  const at = main.indexOf(id);
  if (at < 0) return;
  const next = at + dir;
  if (next < 0 || next >= main.length) return;
  const swapped = [...main];
  const current = swapped[at];
  const other = swapped[next];
  if (!current || !other) return;
  swapped[at] = other;
  swapped[next] = current;
  persistSidebar({
    main: swapped,
    more: [],
  });
}
