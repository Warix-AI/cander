/**
 * Layered ConversationHistoryRetriever — in-chat keyword + cross-chat FTS/keyword.
 */

export type HistoryRow = {
  id: string;
  role: string;
  content: string;
  sort_order: number;
};

export type CrossChatHit = {
  chatId: string;
  chatTitle: string;
  summary: string;
  snippet: string;
  scope: "chat" | "workspace" | "project" | "owner";
  score: number;
};

export interface ConversationHistoryRetriever {
  search(opts: {
    chatId: string;
    query: string;
    limit?: number;
    excludeIds?: Set<string>;
  }): Promise<HistoryRow[]>;
}

export interface LayeredMemoryRetriever {
  searchInChat(opts: {
    chatId: string;
    queries: string[];
    limit?: number;
    excludeIds?: Set<string>;
  }): Promise<HistoryRow[]>;

  searchCrossChat(opts: {
    currentChatId: string;
    queries: string[];
    workspaceId: string | null;
    projectRefIds: string[];
    limit?: number;
  }): Promise<CrossChatHit[]>;
}

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 12);
}

function scoreRow(row: HistoryRow, kws: string[]): number {
  const lower = row.content.toLowerCase();
  let score = 0;
  for (const k of kws) {
    if (lower.includes(k)) score += 1;
  }
  return score;
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
        .limit(200);
      if (error) throw error;

      const scored: Array<{ row: HistoryRow; score: number }> = [];
      for (const row of (data ?? []) as HistoryRow[]) {
        if (opts.excludeIds?.has(row.id)) continue;
        if (/^\s*Internal result for\b/i.test(row.content)) continue;
        const s = scoreRow(row, kws);
        if (s > 0) scored.push({ row, score: s });
      }
      scored.sort((a, b) => b.score - a.score || b.row.sort_order - a.row.sort_order);
      return scored.slice(0, limit).map((s) => s.row).reverse();
    },
  };
}

export function createLayeredMemoryRetriever(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
): LayeredMemoryRetriever {
  const inChat = createKeywordHistoryRetriever(supabase, ownerId);

  return {
    async searchInChat(opts) {
      const limit = Math.min(opts.limit ?? 8, 14);
      const excludeIds = opts.excludeIds ?? new Set<string>();
      const merged = new Map<string, HistoryRow>();
      for (const q of opts.queries.slice(0, 5)) {
        const rows = await inChat.search({
          chatId: opts.chatId,
          query: q,
          limit,
          excludeIds,
        });
        for (const row of rows) merged.set(row.id, row);
      }
      return [...merged.values()]
        .sort((a, b) => a.sort_order - b.sort_order)
        .slice(-limit);
    },

    async searchCrossChat(opts) {
      const limit = Math.min(opts.limit ?? 4, 8);
      const queryText = opts.queries.join(" ").slice(0, 240);
      if (!queryText.trim()) return [];

      const hits: CrossChatHit[] = [];
      const seen = new Set<string>();

      // Layer 2a: FTS on memory index (same workspace)
      if (opts.workspaceId) {
        const { data: wsHits } = await supabase
          .from("ai_chat_memory_index")
          .select("chat_id, title, summary, entities, topics")
          .eq("owner_id", ownerId)
          .eq("workspace_id", opts.workspaceId)
          .neq("chat_id", opts.currentChatId)
          .textSearch("search_document", queryText, { type: "websearch", config: "english" })
          .limit(limit);
        for (const row of wsHits ?? []) {
          if (seen.has(row.chat_id)) continue;
          seen.add(row.chat_id);
          hits.push({
            chatId: row.chat_id,
            chatTitle: row.title ?? "Chat",
            summary: row.summary ?? "",
            snippet: [row.summary, ...(row.entities ?? []), ...(row.topics ?? [])]
              .filter(Boolean)
              .join(" · ")
              .slice(0, 500),
            scope: "workspace",
            score: 3,
          });
        }
      }

      // Layer 2b: project/Space refs overlap
      if (opts.projectRefIds.length && hits.length < limit) {
        const { data: projHits } = await supabase
          .from("ai_chat_memory_index")
          .select("chat_id, title, summary, entities, topics, project_ref_ids")
          .eq("owner_id", ownerId)
          .neq("chat_id", opts.currentChatId)
          .overlaps("project_ref_ids", opts.projectRefIds)
          .limit(limit);
        for (const row of projHits ?? []) {
          if (seen.has(row.chat_id)) continue;
          seen.add(row.chat_id);
          hits.push({
            chatId: row.chat_id,
            chatTitle: row.title ?? "Chat",
            summary: row.summary ?? "",
            snippet: [row.summary, ...(row.entities ?? []), ...(row.topics ?? [])]
              .filter(Boolean)
              .join(" · ")
              .slice(0, 500),
            scope: "project",
            score: 2,
          });
        }
      }

      // Layer 2c: owner-wide keyword fallback on index entities/topics
      if (hits.length < limit) {
        const kws = keywords(queryText);
        const { data: allIndex } = await supabase
          .from("ai_chat_memory_index")
          .select("chat_id, title, summary, entities, topics")
          .eq("owner_id", ownerId)
          .neq("chat_id", opts.currentChatId)
          .order("updated_at", { ascending: false })
          .limit(40);
        for (const row of allIndex ?? []) {
          if (seen.has(row.chat_id)) continue;
          const blob = [
            row.title,
            row.summary,
            ...(row.entities ?? []),
            ...(row.topics ?? []),
          ]
            .join(" ")
            .toLowerCase();
          let score = 0;
          for (const k of kws) {
            if (blob.includes(k)) score += 1;
          }
          if (score > 0) {
            seen.add(row.chat_id);
            hits.push({
              chatId: row.chat_id,
              chatTitle: row.title ?? "Chat",
              summary: row.summary ?? "",
              snippet: blob.slice(0, 500),
              scope: "owner",
              score,
            });
          }
        }
      }

      // Enrich top hits with a matching message snippet from each chat
      const enriched: CrossChatHit[] = [];
      for (const hit of hits.sort((a, b) => b.score - a.score).slice(0, limit)) {
        const kws = keywords(queryText);
        const { data: msgs } = await supabase
          .from("ai_chat_messages")
          .select("role, content, sort_order")
          .eq("chat_id", hit.chatId)
          .eq("owner_id", ownerId)
          .order("sort_order", { ascending: false })
          .limit(30);
        let best = hit.snippet;
        let bestScore = 0;
        for (const m of msgs ?? []) {
          if (/^\s*Internal result for\b/i.test(m.content)) continue;
          const s = scoreRow(
            { id: "", role: m.role, content: m.content, sort_order: m.sort_order },
            kws,
          );
          if (s > bestScore) {
            bestScore = s;
            best = `${m.role}: ${m.content.slice(0, 400)}`;
          }
        }
        enriched.push({ ...hit, snippet: best });
      }

      return enriched;
    },
  };
}
