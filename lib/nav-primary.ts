/** Desktop primary nav sections — icon rail destinations. */
export type PrimaryNavSection =
  | "apps"
  | "workspaces"
  | "chats"
  | "automations"
  | "general";

/** Top rail destinations (General lives on the bottom account control). */
export const PRIMARY_NAV_SECTIONS: PrimaryNavSection[] = [
  "apps",
  "workspaces",
  "chats",
  "automations",
];

export const PRIMARY_NAV_LABEL: Record<PrimaryNavSection, string> = {
  apps: "Apps",
  workspaces: "Workspaces",
  chats: "Chats",
  automations: "Automations",
  general: "General",
};

const SECTION_KEY = "cander-primary-nav-section";
const LAST_ITEM_KEY = "cander-primary-nav-last";
const CONTEXT_OPEN_KEY = "cander-context-nav-open";

/** Migrate renamed / removed section ids from earlier builds. */
function normalizeSection(raw: string | null): PrimaryNavSection | null {
  if (!raw) return null;
  // Images rail → Automations; agents alias → Automations.
  if (raw === "images" || raw === "agents") return "automations";
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

type LastMap = Partial<Record<PrimaryNavSection, string>>;

export function readLastNavItem(section: PrimaryNavSection): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_ITEM_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as LastMap;
    // Migrate last-item map key from images → automations.
    if (section === "automations" && map.automations == null) {
      const legacy = (map as LastMap & { images?: string }).images;
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
