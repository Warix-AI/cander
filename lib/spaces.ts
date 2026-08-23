import type { BillingPlan, SpaceId } from "./types";

/** Chat Spaces in the primary sidebar group. */
export const PRIMARY_NAV_SPACES: SpaceId[] = [
  "work",
  "build",
  "studio",
  "research",
  "personal",
];

/** Navigable product destinations (Spaces + Connectors for permissions). */
export const NAV_SPACES: SpaceId[] = [...PRIMARY_NAV_SPACES, "connectors"];

/**
 * Legacy spaces: reachable via pins/deep links/panels, not primary sidebar.
 * Strategy: keep data routing; surface via Discovery or space tools —
 * do not re-add to PRIMARY_NAV without a product decision.
 */
export const LEGACY_SPACES: SpaceId[] = [
  "files",
  "skills",
  "scheduled",
  "finances",
  "health",
];

export const ALL_SPACE_IDS: SpaceId[] = [...NAV_SPACES, ...LEGACY_SPACES];

/** Extra ids — Recents stays in primary nav; Browser is not a sidebar link. */
export const EXTRA_NAV_IDS = ["browser", "recents"] as const;

export type ExtraNavId = (typeof EXTRA_NAV_IDS)[number];
export type SidebarNavId = SpaceId | ExtraNavId;

export const CHAT_SPACES = [
  "work",
  "build",
  "studio",
  "research",
  "personal",
  "skills",
  "finances",
  "health",
] as const;

export type ChatSpaceId = (typeof CHAT_SPACES)[number];

export type SidebarNavOpts = {
  billingPlan?: BillingPlan;
  personalEnabled?: boolean;
};

export function isChatSpace(
  id: SpaceId | null | undefined,
): id is ChatSpaceId {
  return Boolean(id && (CHAT_SPACES as readonly string[]).includes(id));
}

export function isExtraNavId(id: string): id is ExtraNavId {
  return (EXTRA_NAV_IDS as readonly string[]).includes(id);
}

export function isSidebarNavId(id: string): id is SidebarNavId {
  return isExtraNavId(id) || ALL_SPACE_IDS.includes(id as SpaceId);
}

/** Default sidebar — five Spaces, then Recents. */
export const DEFAULT_SIDEBAR_MAIN: SidebarNavId[] = [
  ...PRIMARY_NAV_SPACES,
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
  opts?: SidebarNavOpts,
): boolean {
  if (id === "browser") return false;
  if (id === "connectors") return false;
  if (id === "files") return false;
  if (id === "recents") return true;
  if (id === "work") {
    if (
      opts?.billingPlan &&
      opts.billingPlan !== "max" &&
      opts.billingPlan !== "ultra"
    ) {
      return false;
    }
    return allowed.includes("work");
  }
  if (id === "personal") {
    const inCatalog =
      allowed.includes("personal") ||
      allowed.includes("finances") ||
      allowed.includes("health");
    if (!inCatalog) return false;
    if (
      opts?.billingPlan &&
      opts.billingPlan !== "max" &&
      opts.billingPlan !== "ultra"
    ) {
      return true;
    }
    return Boolean(opts?.personalEnabled);
  }
  if (isExtraNavId(id)) return true;
  return allowed.includes(id as SpaceId);
}

export function allowedNavItems(
  allowed: SpaceId[],
  opts?: SidebarNavOpts,
): SidebarNavId[] {
  return dedupeNav(
    DEFAULT_SIDEBAR_MAIN.filter((id) => spaceAllowed(id, allowed, opts)),
  );
}

/** Map retired sidebar ids away from the nav. */
export function migrateSidebarId(id: SidebarNavId): SidebarNavId | null {
  if (
    id === "browser" ||
    id === "files" ||
    id === "connectors" ||
    id === "skills" ||
    id === "scheduled"
  ) {
    return null;
  }
  if (id === "finances" || id === "health") return "personal";
  return id;
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

  // Fold any legacy "more" entries into main, then drop unsupported ids.
  let main = useDefaults
    ? defaultMain
    : migrateList([...layout.main, ...layout.more]);

  const rest = pool.filter((id) => !main.includes(id));
  if (useDefaults) {
    main = sortMainNav([...main, ...rest]);
  } else {
    const rankedRest = DEFAULT_SIDEBAR_MAIN.filter((id) => rest.includes(id));
    const extraRest = rest.filter((id) => !DEFAULT_SIDEBAR_MAIN.includes(id));
    main = dedupeNav([...main, ...rankedRest, ...extraRest]);
  }

  const core = main.filter((id) => id !== "personal" && id !== "recents");
  main = [
    ...core,
    ...(main.includes("personal") ? (["personal"] as SidebarNavId[]) : []),
    ...(main.includes("recents") ? (["recents"] as SidebarNavId[]) : []),
  ];

  return { main, more: [] };
}
