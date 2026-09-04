import type { BillingPlan, NavDestinationId, SpaceId } from "./types";

/**
 * Product spaces — Explore (`research`) and Create (`studio`).
 * Build projects keep internal id `build` but live under Create in the UI.
 * Legacy `home` remains on SpaceId for redirects only.
 * Work exists in data/chat but is hidden from the primary menu.
 */
export const PRIMARY_NAV_SPACES: SpaceId[] = ["research", "studio"];

/** Work space stays in the product model but is not shown in nav. */
export const SHOW_WORK_NAV = false;

/** Create (studio) stays in the primary menu. */
export const SHOW_STUDIO_NAV = true;

/** Map legacy dashboard Home → Explore (`research`). */
export function resolveProductSpaceId(
  id: SpaceId | NavDestinationId | null | undefined,
): SpaceId | null {
  if (!id || id === "connectors") return null;
  if (id === "home") return "research";
  return id as SpaceId;
}

/**
 * Nav destinations only — Build opens Create so the sidebar stays Explore + Create.
 * Do not use when resolving a project's stored `space` for ProjectBrowserPanel.
 */
export function resolveNavSpaceId(
  id: SpaceId | NavDestinationId | null | undefined,
): SpaceId | null {
  const resolved = resolveProductSpaceId(id);
  if (resolved === "build") return "studio";
  return resolved;
}

/** Sidebar highlight: Build projects light up Create. */
export function navSpaceMatches(
  navId: SidebarNavId,
  spaceId: SpaceId | NavDestinationId | null | undefined,
): boolean {
  if (!spaceId || spaceId === "connectors") return false;
  if (navId === spaceId) return true;
  return navId === "studio" && spaceId === "build";
}

/** Nav-only for now — shown disabled with “Coming soon”. */
export const COMING_SOON_NAV_SPACES: SpaceId[] = [];

export const NAV_SPACES: SpaceId[] = [...PRIMARY_NAV_SPACES];
/** All product space ids including hidden Work (data / legacy chat). */
export const ALL_SPACE_IDS: SpaceId[] = [
  "research",
  "work",
  "build",
  "studio",
];

/** Non-space sidebar destinations. */
export const EXTRA_NAV_IDS = ["browser", "recents", "connectors"] as const;

export type ExtraNavId = (typeof EXTRA_NAV_IDS)[number];
export type SidebarNavId = SpaceId | ExtraNavId;

export const CHAT_SPACES = ["work", "build", "research", "studio"] as const;

export type ChatSpaceId = (typeof CHAT_SPACES)[number];

export type SidebarNavOpts = {
  billingPlan?: BillingPlan;
};

export function isComingSoonNav(
  id: SidebarNavId,
): id is (typeof COMING_SOON_NAV_SPACES)[number] {
  return COMING_SOON_NAV_SPACES.includes(id as SpaceId);
}

export function isChatSpace(
  id: SpaceId | NavDestinationId | null | undefined,
): id is ChatSpaceId {
  return Boolean(
    id && id !== "connectors" && (CHAT_SPACES as readonly string[]).includes(id),
  );
}

/** Work / Build / Home (research) — shared dock chat spaces. */
export function isDockChatSpace(
  id: SpaceId | NavDestinationId | null | undefined,
): id is ChatSpaceId {
  return isChatSpace(resolveProductSpaceId(id) ?? id);
}

/** Formerly Home dashboard — no product space is dashboard-only now. */
export function isDashboardOnlySpace(
  _id: SpaceId | NavDestinationId | null | undefined,
): boolean {
  return false;
}

/** Product space for chat persistence — excludes Connectors nav. */
export function chatSpaceId(
  id: NavDestinationId | null | undefined,
): SpaceId | null {
  if (!id || id === "connectors") return null;
  return resolveProductSpaceId(id);
}

export function isExtraNavId(id: string): id is ExtraNavId {
  return (EXTRA_NAV_IDS as readonly string[]).includes(id);
}

export function isNavVisible(id: SidebarNavId): boolean {
  if (id === "studio") return SHOW_STUDIO_NAV;
  if (id === "work") return SHOW_WORK_NAV;
  return true;
}

export function isSidebarNavId(id: string): id is SidebarNavId {
  return isExtraNavId(id) || ALL_SPACE_IDS.includes(id as SpaceId);
}

/** Connectors nav visible for all plans — installs ship later. */
export const SHOW_CONNECTORS_NAV = true;

/** Default sidebar — Explore, Create, Connectors, Recents. */
export const DEFAULT_SIDEBAR_MAIN: SidebarNavId[] = [
  ...PRIMARY_NAV_SPACES,
  ...(SHOW_CONNECTORS_NAV ? (["connectors"] as const) : []),
  "recents",
];

/** @deprecated More menu removed — kept empty for persisted layout shape. */
export const DEFAULT_MORE_NAV: SidebarNavId[] = [];

export type SidebarLayout = {
  main: SidebarNavId[];
  more: SidebarNavId[];
};

export const defaultSidebarLayout: SidebarLayout = {
  main: [],
  more: [],
};

function dedupeNav(ids: SidebarNavId[]): SidebarNavId[] {
  const out: SidebarNavId[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function sortMainNav(ids: SidebarNavId[]): SidebarNavId[] {
  const ranked = DEFAULT_SIDEBAR_MAIN.filter((id) => ids.includes(id));
  const extra = ids.filter((id) => !DEFAULT_SIDEBAR_MAIN.includes(id));
  return dedupeNav([...ranked, ...extra]);
}

export function spaceAllowed(
  id: SidebarNavId,
  allowed: SpaceId[],
  _opts?: SidebarNavOpts,
): boolean {
  if (id === "browser") return false;
  if (id === "connectors") return SHOW_CONNECTORS_NAV;
  if (id === "recents") return true;
  if (id === "studio") return true;
  // Legacy dashboard home is not a nav destination.
  if (id === "home") return false;
  // Work is hidden from the menu on desktop and mobile.
  if (id === "work") return SHOW_WORK_NAV;
  return allowed.includes(id as SpaceId);
}

export function allowedNavItems(
  allowed: SpaceId[],
  opts?: SidebarNavOpts,
): SidebarNavId[] {
  return dedupeNav(
    DEFAULT_SIDEBAR_MAIN.filter(
      (id) => spaceAllowed(id, allowed, opts) && isNavVisible(id),
    ),
  );
}

export function migrateSidebarId(id: string): SidebarNavId | null {
  if (
    id === "browser" ||
    id === "files" ||
    id === "skills" ||
    id === "scheduled" ||
    id === "personal" ||
    id === "finances" ||
    id === "health"
  ) {
    return null;
  }
  // Old Home dashboard slot → Explore (research).
  if (id === "home") return "research";
  // Build merged into Create (studio).
  if (id === "build") return "studio";
  // Work removed from primary nav.
  if (id === "work") return null;
  if (isSidebarNavId(id)) return id;
  return null;
}

export function resolveSidebarNav(
  allowed: SpaceId[],
  layout: SidebarLayout,
  opts?: SidebarNavOpts,
): { main: SidebarNavId[]; more: SidebarNavId[] } {
  const pool = allowedNavItems(allowed, opts);
  const defaultMain = DEFAULT_SIDEBAR_MAIN.filter((id) => pool.includes(id));

  const migrateList = (list: SidebarNavId[]) => {
    const out: SidebarNavId[] = [];
    for (const id of list) {
      const next = migrateSidebarId(id);
      if (next && pool.includes(next) && !out.includes(next)) out.push(next);
    }
    return out;
  };

  const useDefaults = !layout.main.length && !layout.more.length;

  let main = useDefaults
    ? defaultMain
    : migrateList([...layout.main, ...layout.more]);

  const rest = pool.filter((id) => !main.includes(id));
  if (useDefaults) {
    main = sortMainNav([...main, ...rest]);
  } else {
    const rankedRest = DEFAULT_SIDEBAR_MAIN.filter((id) => rest.includes(id));
    const extraRest = rest.filter((id) => !DEFAULT_SIDEBAR_MAIN.includes(id));
    main = sortMainNav(dedupeNav([...main, ...rankedRest, ...extraRest]));
  }

  return { main, more: [] };
}
