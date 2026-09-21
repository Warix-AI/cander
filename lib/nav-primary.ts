/** Desktop primary nav sections — icon rail destinations. */
export type PrimaryNavSection =
  | "workspaces"
  | "chats"
  | "apps"
  | "automations";

export const PRIMARY_NAV_SECTIONS: PrimaryNavSection[] = [
  "workspaces",
  "chats",
  "apps",
  "automations",
];

export const PRIMARY_NAV_LABEL: Record<PrimaryNavSection, string> = {
  workspaces: "Workspaces",
  chats: "Chats",
  apps: "Apps",
  automations: "Automations",
};

const SECTION_KEY = "cander-primary-nav-section";
const LAST_ITEM_KEY = "cander-primary-nav-last";
const CONTEXT_OPEN_KEY = "cander-context-nav-open";

export function readPrimaryNavSection(): PrimaryNavSection {
  if (typeof window === "undefined") return "apps";
  try {
    const raw = window.localStorage.getItem(SECTION_KEY);
    if (raw && (PRIMARY_NAV_SECTIONS as readonly string[]).includes(raw)) {
      return raw as PrimaryNavSection;
    }
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
