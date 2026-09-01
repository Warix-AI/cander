import type { SpaceId } from "@/lib/types";

export type IndexEntryKind = "thread" | "project" | "source" | "briefing";

export type SpaceIndexEntry = {
  key: string;
  kind: IndexEntryKind;
  entityId: string;
  title: string;
  meta: string;
  space?: SpaceId;
  workspaceId: string;
  updatedAt: string;
  rank: number;
  cover?: string;
  badge?: string;
  snippet?: string;
  createdById?: string;
  createdByName?: string;
  /** Set when a thread row is tied to a build/explore project. */
  linkedProjectId?: string;
};

/** Lower rank = more recent. Works with ISO timestamps and legacy relative strings. */
export function recencyRank(updatedAt: string) {
  const parsed = Date.parse(updatedAt);
  if (!Number.isNaN(parsed)) {
    return Math.max(0, Math.floor((Date.now() - parsed) / 60_000));
  }
  const text = updatedAt.toLowerCase();
  if (text.includes("just now")) return 0;
  if (text.includes("this morning")) return 1;
  const hours = text.match(/(\d+)\s*h/);
  if (hours) return 10 + Number(hours[1]);
  if (text.includes("yesterday")) return 40;
  const days = text.match(/(\d+)\s*d/);
  if (days) return 50 + Number(days[1]);
  const weeks = text.match(/(\d+)\s*w/);
  if (weeks) return 80 + Number(weeks[1]) * 7;
  return 100;
}

export function sortIndexEntries(items: SpaceIndexEntry[]) {
  return [...items].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

export function filterIndexEntries(items: SpaceIndexEntry[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      item.meta.toLowerCase().includes(needle) ||
      (item.snippet?.toLowerCase().includes(needle) ?? false),
  );
}
