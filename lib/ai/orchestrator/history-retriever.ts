/**
 * ConversationHistoryRetriever interface + keyword v1 (client-side tests).
 */

export type HistoryRow = {
  id: string;
  role: string;
  content: string;
  sort_order: number;
};

export interface ConversationHistoryRetriever {
  search(opts: {
    chatId: string;
    query: string;
    limit?: number;
    excludeIds?: Set<string>;
    /** Injected corpus for unit tests */
    corpus?: HistoryRow[];
  }): Promise<HistoryRow[]>;
}

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 12);
}

export function createKeywordHistoryRetriever(
  corpus: HistoryRow[],
): ConversationHistoryRetriever {
  return {
    async search(opts) {
      const limit = Math.min(opts.limit ?? 6, 12);
      const kws = keywords(opts.query);
      if (!kws.length) return [];
      const rows = opts.corpus ?? corpus;
      const scored: Array<{ row: HistoryRow; score: number }> = [];
      for (const row of rows) {
        if (opts.excludeIds?.has(row.id)) continue;
        if (/^\s*Internal result for\b/i.test(row.content)) continue;
        const lower = row.content.toLowerCase();
        let score = 0;
        for (const k of kws) {
          if (lower.includes(k)) score += 1;
        }
        if (score > 0) scored.push({ row, score });
      }
      scored.sort(
        (a, b) => b.score - a.score || b.row.sort_order - a.row.sort_order,
      );
      return scored
        .slice(0, limit)
        .map((s) => s.row)
        .reverse();
    },
  };
}
