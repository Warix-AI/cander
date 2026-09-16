/**
 * Sidebar Experts catalog — same discovery pattern as Apps (Add → listed + reorder).
 * Shared icon until per-expert art ships.
 */

export const EXPERT_ICON_SRC = "/experts/expert-icon.png";

export type ExpertCatalogEntry = {
  id: string;
  name: string;
  /** Path under /public — same asset for every expert for now. */
  icon: string;
};

/** Prefill Experts More list (order = display order). */
export const EXPERT_CATALOG: ExpertCatalogEntry[] = [
  { id: "summarize", name: "Summarize", icon: EXPERT_ICON_SRC },
  { id: "monitor", name: "Monitor", icon: EXPERT_ICON_SRC },
  { id: "follow-up", name: "Follow-up", icon: EXPERT_ICON_SRC },
  { id: "research", name: "Research", icon: EXPERT_ICON_SRC },
  { id: "organizer", name: "Organizer", icon: EXPERT_ICON_SRC },
  { id: "draft", name: "Draft", icon: EXPERT_ICON_SRC },
  { id: "scheduler", name: "Scheduler", icon: EXPERT_ICON_SRC },
];

const BY_ID = new Map(EXPERT_CATALOG.map((item) => [item.id, item] as const));

export function isExpertCatalogId(id: string): boolean {
  return BY_ID.has(id);
}

export function expertCatalogEntry(id: string): ExpertCatalogEntry | undefined {
  return BY_ID.get(id);
}

/** Experts not yet added to the sidebar list. */
export function listSidebarAvailableExperts(opts: {
  listedIds: Iterable<string>;
}): ExpertCatalogEntry[] {
  const listed = new Set(opts.listedIds);
  return EXPERT_CATALOG.filter((item) => !listed.has(item.id));
}
