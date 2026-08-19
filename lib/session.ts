import type {
  AccountPresetId,
  BillingPlan,
  HostingMode,
  Pin,
  PinKind,
  ProductId,
  SpaceId,
  Theme,
} from "@/lib/types";
import { accountPresets, members } from "@/lib/data";
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

type Listener = () => void;

const SIDEBAR_STORAGE_VERSION = 9;

const workspaceListeners = new Set<Listener>();
let workspaceId = "marketing";

function emitWorkspace() {
  workspaceListeners.forEach((listener) => listener());
}

export function subscribeWorkspace(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-workspace");
    if (stored) workspaceId = stored;
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
  return "marketing";
}

export function persistWorkspace(next: string) {
  workspaceId = next;
  window.localStorage.setItem("courier-workspace", next);
  emitWorkspace();
}

const productListeners = new Set<Listener>();
let product: ProductId = "courier";

function emitProduct() {
  productListeners.forEach((listener) => listener());
}

export function subscribeProduct(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-product");
    if (stored === "courier" || stored === "platform") {
      product = stored;
    }
  }
  productListeners.add(listener);
  return () => {
    productListeners.delete(listener);
  };
}

export function getProductSnapshot() {
  return product;
}

export function getProductServerSnapshot(): ProductId {
  return "courier";
}

export function persistProduct(next: ProductId) {
  product = next;
  window.localStorage.setItem("courier-product", next);
  emitProduct();
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
  return "dark";
}

export function persistTheme(next: Theme) {
  document.documentElement.classList.toggle("dark", next === "dark");
  window.localStorage.setItem("theme", next);
}

const authListeners = new Set<Listener>();
let signedIn = false;

function emitAuth() {
  authListeners.forEach((listener) => listener());
}

export function subscribeAuth(listener: Listener) {
  if (typeof window !== "undefined") {
    signedIn = window.localStorage.getItem("courier-signed-in") === "1";
  }
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function getAuthSnapshot() {
  return signedIn;
}

export function getAuthServerSnapshot() {
  return false;
}

export function persistSignedIn() {
  signedIn = true;
  window.localStorage.setItem("courier-signed-in", "1");
  emitAuth();
}

export function persistSignedOut() {
  signedIn = false;
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
let actorId = "m1";

function emitActor() {
  actorListeners.forEach((listener) => listener());
}

export function subscribeActor(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-actor");
    if (stored && members.some((item) => item.id === stored)) {
      actorId = stored;
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
  return "m1";
}

export function persistActor(next: string) {
  if (!members.some((item) => item.id === next)) return;
  actorId = next;
  window.localStorage.setItem("courier-actor", next);
  emitActor();
}

export function presetIdForActor(id: string): AccountPresetId {
  return (
    accountPresets.find((item) => item.actorId === id)?.id ?? "max-owner"
  );
}

const planListeners = new Set<Listener>();
let billingPlan: BillingPlan = "max";

function emitPlan() {
  planListeners.forEach((listener) => listener());
}

const PLAN_STORAGE_VERSION = "4";

export function subscribePlan(listener: Listener) {
  if (typeof window !== "undefined") {
    const version = window.localStorage.getItem("courier-plan-v");
    const stored = window.localStorage.getItem("courier-plan");
    if (version !== PLAN_STORAGE_VERSION) {
      if (stored === "plus" || stored === "personal") billingPlan = "pro";
      else if (stored === "pro" || stored === "business") billingPlan = "max";
      else if (stored === "max" || stored === "ultra" || stored === "free") {
        billingPlan = stored;
      }
      window.localStorage.setItem("courier-plan-v", PLAN_STORAGE_VERSION);
      window.localStorage.setItem("courier-plan", billingPlan);
    } else if (
      stored === "free" ||
      stored === "pro" ||
      stored === "max" ||
      stored === "ultra"
    ) {
      billingPlan = stored;
    }
  }
  planListeners.add(listener);
  return () => {
    planListeners.delete(listener);
  };
}

export function getPlanSnapshot() {
  return billingPlan;
}

export function getPlanServerSnapshot(): BillingPlan {
  return "max";
}

export function persistPlan(next: BillingPlan) {
  billingPlan = next;
  window.localStorage.setItem("courier-plan-v", PLAN_STORAGE_VERSION);
  window.localStorage.setItem("courier-plan", next);
  emitPlan();
}

const personalSpaceListeners = new Set<Listener>();
let personalSpaceEnabled = true;

function emitPersonalSpace() {
  personalSpaceListeners.forEach((listener) => listener());
}

export function subscribePersonalSpace(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-personal-space");
    if (stored === "on") personalSpaceEnabled = true;
    if (stored === "off") personalSpaceEnabled = false;
  }
  personalSpaceListeners.add(listener);
  return () => {
    personalSpaceListeners.delete(listener);
  };
}

export function getPersonalSpaceSnapshot() {
  return personalSpaceEnabled;
}

export function getPersonalSpaceServerSnapshot() {
  return true;
}

export function persistPersonalSpace(next: boolean) {
  personalSpaceEnabled = next;
  window.localStorage.setItem("courier-personal-space", next ? "on" : "off");
  emitPersonalSpace();
}

const pinListeners = new Set<Listener>();
const emptyPins: Pin[] = [];
let pins: Pin[] = emptyPins;
let pinsHydrated = false;

function parsePins(raw: string | null): Pin[] {
  if (!raw) return emptyPins;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return emptyPins;
    const next = data.filter(
      (item): item is Pin =>
        Boolean(item) &&
        typeof item === "object" &&
        (item.kind === "thread" || item.kind === "project") &&
        typeof item.id === "string",
    );
    return next.length ? next : emptyPins;
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
}

export function subscribePins(listener: Listener) {
  hydratePins();
  pinListeners.add(listener);
  return () => {
    pinListeners.delete(listener);
  };
}

export function getPinsSnapshot() {
  return pins;
}

export function getPinsServerSnapshot(): Pin[] {
  return emptyPins;
}

export function persistPins(next: Pin[]) {
  pins = next.length ? next : emptyPins;
  window.localStorage.setItem("courier-pins", JSON.stringify(pins));
  emitPins();
}

export function toggleStoredPin(kind: PinKind, id: string) {
  hydratePins();
  const exists = pins.some((item) => item.kind === kind && item.id === id);
  persistPins(
    exists
      ? pins.filter((item) => !(item.kind === kind && item.id === id))
      : [{ kind, id }, ...pins],
  );
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
    if (main.includes("browser") || more.includes("browser")) return true;
    if (main.includes("files") || more.includes("files")) return true;
    if (main.includes("connectors") || more.includes("connectors")) return true;
    const personalAt = main.indexOf("personal");
    const recentsAt = main.indexOf("recents");
    if (personalAt >= 0 && recentsAt >= 0 && recentsAt < personalAt) return true;
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

export function moveSidebarNav(
  id: SidebarNavId,
  allowed: SpaceId[],
  dir: -1 | 1,
  opts?: SidebarNavOpts,
) {
  hydrateSidebar();
  const { main, more } = resolveSidebarNav(allowed, sidebarLayout, opts);
  const combined = [...main, ...more];
  const split = main.length;
  const at = combined.indexOf(id);
  if (at < 0) return;

  if (dir === 1 && at === split - 1) {
    persistSidebar({
      main: combined.slice(0, split - 1),
      more: combined.slice(split - 1),
    });
    return;
  }

  if (dir === -1 && at === split) {
    persistSidebar({
      main: combined.slice(0, split + 1),
      more: combined.slice(split + 1),
    });
    return;
  }

  const next = at + dir;
  if (next < 0 || next >= combined.length) return;
  const swapped = [...combined];
  const current = swapped[at];
  const other = swapped[next];
  if (!current || !other) return;
  swapped[at] = other;
  swapped[next] = current;
  persistSidebar({
    main: swapped.slice(0, split),
    more: swapped.slice(split),
  });
}
