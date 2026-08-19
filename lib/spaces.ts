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

/** Legacy spaces kept for data, deep links, and panel routing. */
export const LEGACY_SPACES: SpaceId[] = [
  "files",
  "skills",
  "scheduled",
  "finances",
  "health",
];

export const ALL_SPACE_IDS: SpaceId[] = [...NAV_SPACES, ...LEGACY_SPACES];

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

/** Overflow only — empty until someone moves a link into More. */
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

function sortMoreNav(ids: SidebarNavId[]): SidebarNavId[] {
  const ranked = DEFAULT_MORE_NAV.filter((id) => ids.includes(id));
  const extra = ids.filter((id) => !DEFAULT_MORE_NAV.includes(id));
  return dedupeNav([...ranked, ...extra]);
}

export function spaceAllowed(
  id: SidebarNavId,
  allowed: SpaceId[],
  opts?: SidebarNavOpts,
): boolean {
  if (id === "browser" || id === "files" || id === "connectors") return false;
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
  const defaultMore = DEFAULT_MORE_NAV.filter((id) => pool.includes(id));

  const migrateList = (list: SidebarNavId[]) => {
    const out: SidebarNavId[] = [];
    for (const id of list) {
      const next = migrateSidebarId(id);
      if (next && pool.includes(next) && !out.includes(next)) out.push(next);
    }
    return out;
  };

  const useDefaults = !layout.main.length && !layout.more.length;

  let main = useDefaults ? defaultMain : migrateList(layout.main);
  let more = useDefaults ? defaultMore : migrateList(layout.more);

  for (const id of [...more]) {
    if (id === "personal" && pool.includes("personal")) {
      more = more.filter((item) => item !== id);
      if (!main.includes(id)) main.push(id);
    }
  }

  more = sortMoreNav(more.filter((id) => pool.includes(id)));
  main = main.filter((id) => pool.includes(id) && !more.includes(id));

  const rest = pool.filter((id) => !main.includes(id) && !more.includes(id));
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

  return { main, more };
}
