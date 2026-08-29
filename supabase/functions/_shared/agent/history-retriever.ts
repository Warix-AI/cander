/**
 * ConversationHistoryRetriever — keyword/entity v1.
 * Semantic/hybrid later without changing the orchestrator call site.
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
    /** Messages already in the recent window (exclude from retrieval). */
    excludeIds?: Set<string>;
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
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
): ConversationHistoryRetriever {
  return {
    async search(opts) {
      const limit = Math.min(opts.limit ?? 6, 12);
      const kws = keywords(opts.query);
      if (!kws.length) return [];

      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("id, role, content, sort_order")
        .eq("chat_id", opts.chatId)
        .eq("owner_id", ownerId)
        .order("sort_order", { ascending: false })
        .limit(120);
      if (error) throw error;

      const scored: Array<{ row: HistoryRow; score: number }> = [];
      for (const row of (data ?? []) as HistoryRow[]) {
        if (opts.excludeIds?.has(row.id)) continue;
        if (/^\s*Internal result for\b/i.test(row.content)) continue;
        const lower = row.content.toLowerCase();
        let score = 0;
        for (const k of kws) {
          if (lower.includes(k)) score += 1;
        }
        if (score > 0) scored.push({ row, score });
      }
      scored.sort((a, b) => b.score - a.score || b.row.sort_order - a.row.sort_order);
      return scored.slice(0, limit).map((s) => s.row).reverse();
    },
  };
}
