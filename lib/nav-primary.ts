/** Desktop primary nav sections — icon rail destinations. */
export type PrimaryNavSection =
  | "workspaces"
  | "apps"
  | "chats"
  | "images"
  | "general";

/** Icon-only rail vs labeled tabs (wide dual menu). */
export type PrimaryNavRailMode = "icon" | "labeled";

/** Desktop primary rail widths — keep Sidebar + PrimaryNavRail in sync. */
export const PRIMARY_NAV_RAIL_ICON_WIDTH_PX = 56;
/** Labeled mode: tight to longest label; leaves ~half the prior dead space before context. */
export const PRIMARY_NAV_RAIL_LABELED_WIDTH_PX = 155;

/** Top rail destinations (General lives on the bottom account control). */
export const PRIMARY_NAV_SECTIONS: PrimaryNavSection[] = [
  "workspaces",
  "apps",
  "chats",
  "images",
];

export const PRIMARY_NAV_LABEL: Record<PrimaryNavSection, string> = {
  workspaces: "Workspaces",
  apps: "Apps",
  chats: "Chats",
  images: "Images",
  general: "General",
};

const SECTION_KEY = "cander-primary-nav-section";
const LAST_ITEM_KEY = "cander-primary-nav-last";
const CONTEXT_OPEN_KEY = "cander-context-nav-open";
const RAIL_MODE_KEY = "cander-primary-nav-rail-mode";

/** Migrate renamed / removed section ids from earlier builds. */
function normalizeSection(raw: string | null): PrimaryNavSection | null {
  if (!raw) return null;
  // Automations / agents aliases → Images.
  if (raw === "automations" || raw === "agents") return "images";
  if (
    (PRIMARY_NAV_SECTIONS as readonly string[]).includes(raw) ||
    raw === "general"
  ) {
    return raw as PrimaryNavSection;
  }
  return null;
}

export function readPrimaryNavSection(): PrimaryNavSection {
  if (typeof window === "undefined") return "apps";
  try {
    const next = normalizeSection(window.localStorage.getItem(SECTION_KEY));
    if (next) return next;
  } catch {
    /* ignore */
  }
  return "apps";
}

export function persistPrimaryNavSection(section: PrimaryNavSection) {
  try {
    window.localStorage.setItem(SECTION_KEY, section);
  } catch {
    /* ignore */
  }
}

export function readContextNavOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(CONTEXT_OPEN_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function persistContextNavOpen(open: boolean) {
  try {
    window.localStorage.setItem(CONTEXT_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readPrimaryNavRailMode(): PrimaryNavRailMode {
  if (typeof window === "undefined") return "icon";
  try {
    const raw = window.localStorage.getItem(RAIL_MODE_KEY);
    if (raw === "labeled" || raw === "icon") return raw;
  } catch {
    /* ignore */
  }
  return "icon";
}

export function persistPrimaryNavRailMode(mode: PrimaryNavRailMode) {
  try {
    window.localStorage.setItem(RAIL_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

type LastMap = Partial<Record<PrimaryNavSection, string>>;

export function readLastNavItem(section: PrimaryNavSection): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_ITEM_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as LastMap & {
      automations?: string;
      agents?: string;
    };
    // Migrate last-item map keys from automations/agents → images.
    if (section === "images" && map.images == null) {
      const legacy = map.automations ?? map.agents;
      if (legacy) return legacy;
    }
    return map[section] ?? null;
  } catch {
    return null;
  }
}

export function persistLastNavItem(section: PrimaryNavSection, itemId: string) {
  try {
    const raw = window.localStorage.getItem(LAST_ITEM_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as LastMap;
    map[section] = itemId;
    window.localStorage.setItem(LAST_ITEM_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
