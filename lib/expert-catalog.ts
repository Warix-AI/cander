/**
 * Sidebar Experts catalog — same discovery pattern as Apps (Add → listed + reorder).
 * Shared icon until per-expert art ships.
 *
 * `name` = sidebar label. Hover shows `{kind} expert`.
 */

export const EXPERT_ICON_SRC = "/experts/expert-icon.png";
export const EXPERT_ICON_ORANGE_SRC = "/experts/expert-icon-orange.jpg";

export type ExpertCatalogEntry = {
  id: string;
  /** Display name in the sidebar (renameable later). */
  name: string;
  /** Expert type — hover label is `${kind} expert`. */
  kind: string;
  /** Path under /public — same asset for every expert for now. */
  icon: string;
};

/** Prefill Experts More list (order = display order). */
export const EXPERT_CATALOG: ExpertCatalogEntry[] = [
  { id: "summarize", name: "Pulse", kind: "Summarize", icon: EXPERT_ICON_ORANGE_SRC },
  { id: "monitor", name: "Watchtower", kind: "Monitor", icon: EXPERT_ICON_SRC },
  { id: "follow-up", name: "Nudge", kind: "Follow-up", icon: EXPERT_ICON_SRC },
  { id: "research", name: "Scout", kind: "Research", icon: EXPERT_ICON_ORANGE_SRC },
  { id: "organizer", name: "Keeper", kind: "Organizer", icon: EXPERT_ICON_SRC },
  { id: "draft", name: "Quill", kind: "Draft", icon: EXPERT_ICON_SRC },
  { id: "scheduler", name: "Tempo", kind: "Scheduler", icon: EXPERT_ICON_SRC },
];

const BY_ID = new Map(EXPERT_CATALOG.map((item) => [item.id, item] as const));

export function isExpertCatalogId(id: string): boolean {
  return BY_ID.has(id);
}

export function expertCatalogEntry(id: string): ExpertCatalogEntry | undefined {
  return BY_ID.get(id);
}

export function expertHoverLabel(expert: Pick<ExpertCatalogEntry, "kind">) {
  return `${expert.kind} expert`;
}

/** Experts not yet added to the sidebar list. */
export function listSidebarAvailableExperts(opts: {
  listedIds: Iterable<string>;
}): ExpertCatalogEntry[] {
  const listed = new Set(opts.listedIds);
  return EXPERT_CATALOG.filter((item) => !listed.has(item.id));
}
