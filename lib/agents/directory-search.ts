/**
 * Pure Expert directory ranking helpers (no DB / path aliases).
 * Safe for node:test imports.
 */

export type ExpertDirectoryEntryLike = {
  id: string;
  projectId: string;
  workspaceId?: string;
  name: string;
  description: string;
  status: string;
};

/**
 * Rank Experts by simple keyword overlap with the situation.
 * Never loads Instructions. Empty query returns the full list (capped).
 */
export function scoreExpertDirectory<T extends ExpertDirectoryEntryLike>(
  entries: T[],
  query: string,
): Array<{ entry: T; score: number }> {
  const q = query.trim().toLowerCase();
  if (!q) return entries.map((entry) => ({ entry, score: 0 }));

  const tokens = q
    .split(/[^a-z0-9@._-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  return entries
    .map((entry) => {
      const hay = `${entry.name} ${entry.description}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += token.length > 5 ? 2 : 1;
      }
      // Prefer distinctive name tokens (e.g. "rescheduling") over generic ones.
      for (const part of entry.name.toLowerCase().split(/[^a-z0-9]+/)) {
        if (part.length > 3 && q.includes(part)) score += 3;
      }
      if (entry.name.toLowerCase() && q.includes(entry.name.toLowerCase())) {
        score += 5;
      }
      return { entry, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function searchExpertDirectory<T extends ExpertDirectoryEntryLike>(
  entries: T[],
  query: string,
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  return scoreExpertDirectory(entries, query)
    .slice(0, limit)
    .map((row) => row.entry);
}

export function formatExpertDirectoryForPrompt(
  entries: ExpertDirectoryEntryLike[],
): string {
  if (!entries.length) return "(No active Experts.)";
  return entries
    .map(
      (e) =>
        `- ${e.name} [${e.status}] (id=${e.id}, project=${e.projectId}): ${
          e.description || "(no description)"
        }`,
    )
    .join("\n");
}

/** Assert payload never includes instructions (defense in depth). */
export function assertNoInstructionsLeak(payload: unknown): boolean {
  const raw = JSON.stringify(payload).toLowerCase();
  return !raw.includes('"instructions"');
}
