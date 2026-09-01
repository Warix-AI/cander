import type { BillingPlan, NavDestinationId, SpaceId } from "./types";

/** Product spaces — Home, Work, Build, Explore (research), Studio. */
export const PRIMARY_NAV_SPACES: SpaceId[] = [
  "home",
  "work",
  "build",
  "research",
  "studio",
];

/** Re-enabled in sidebar — Work, Build, Explore. */
export const SHOW_STUDIO_NAV = true;

/** Nav-only for now — shown disabled with “Coming soon”. */
export const COMING_SOON_NAV_SPACES: SpaceId[] = ["studio"];

export const NAV_SPACES: SpaceId[] = [...PRIMARY_NAV_SPACES];
export const ALL_SPACE_IDS: SpaceId[] = [...PRIMARY_NAV_SPACES];

/** Non-space sidebar destinations. */
export const EXTRA_NAV_IDS = ["browser", "recents", "connectors"] as const;

export type ExtraNavId = (typeof EXTRA_NAV_IDS)[number];
export type SidebarNavId = SpaceId | ExtraNavId;

export const CHAT_SPACES = ["work", "build", "research"] as const;

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

/** Dashboard-only destinations — no chat column or composer. */
export function isDashboardOnlySpace(
  id: SpaceId | NavDestinationId | null | undefined,
): boolean {
  return id === "home";
}

/** Product space for chat persistence — excludes Connectors nav. */
export function chatSpaceId(
  id: NavDestinationId | null | undefined,
): SpaceId | null {
  if (!id || id === "connectors" || id === "home" || id === "studio") return null;
  return id;
}

export function isExtraNavId(id: string): id is ExtraNavId {
  return (EXTRA_NAV_IDS as readonly string[]).includes(id);
}

export function isNavVisible(id: SidebarNavId): boolean {
  if (id === "research" && !SHOW_STUDIO_NAV) return false;
  return true;
}

export function isSidebarNavId(id: string): id is SidebarNavId {
  return isExtraNavId(id) || ALL_SPACE_IDS.includes(id as SpaceId);
}

/** Connectors nav visible for all plans — installs ship later. */
export const SHOW_CONNECTORS_NAV = true;

/** Default sidebar — Home, Work, Build, Explore, Studio, Connectors, Recents. */
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
  if (id === "home" || id === "studio") return true;
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
