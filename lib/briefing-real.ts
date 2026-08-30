/**
 * Detect / strip legacy demo briefing rows that used to pollute Recents.
 * Source of truth for removal is briefing-sync; this is a client guard so
 * cached entity stores do not keep circulating synthetic “Just now” items.
 */

const LEGACY_SYNTHETIC_SUFFIXES = [
  "northwind-reply",
  "slack-threads",
  "launch-sync",
  "vendor-invoice",
  "handshake-review",
] as const;

const LEGACY_ID_RE = new RegExp(
  `^brief-[a-zA-Z0-9_-]+-(${LEGACY_SYNTHETIC_SUFFIXES.join("|")})$`,
);

/** True for rows seeded by the old briefing-sync demo templates. */
export function isLegacySyntheticBriefingId(id: string): boolean {
  return LEGACY_ID_RE.test(id.trim());
}

export function filterRealBriefingItems<T extends { id: string }>(
  items: T[],
): T[] {
  return items.filter((item) => !isLegacySyntheticBriefingId(item.id));
}
