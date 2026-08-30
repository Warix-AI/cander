/**
 * Back-compat wrapper for Edge orchestrators.
 * Delegates to the active WebResearchProvider (Exa by default).
 */
import type { RetrievalSource } from "./types.ts";
import { getWebResearchProvider } from "./web-research/index.ts";

type SearchHit = {
  title: string;
  url: string;
  description: string;
  publishedAt?: string | null;
  source?: string | null;
};

/** @deprecated Prefer getWebResearchProvider().search — kept for V1/V2 call sites. */
export async function braveWebSearch(opts: {
  query: string;
  count?: number;
  signal?: AbortSignal;
  ownerId?: string;
  workspaceId?: string | null;
}): Promise<{ sources: RetrievalSource[]; raw: SearchHit[] }> {
  const provider = getWebResearchProvider();
  const evidence = await provider.search({
    query: opts.query,
    count: opts.count,
    signal: opts.signal,
    ownerId: opts.ownerId,
    workspaceId: opts.workspaceId,
  });

  const raw: SearchHit[] = evidence.sources.map((s) => ({
    title: s.title,
    url: s.url,
    description: s.excerpt ?? "",
    publishedAt: s.publishedAt ?? null,
    source: s.domain || null,
  }));

  const sources: RetrievalSource[] = evidence.sources.map((s) => ({
    id: s.id,
    title: s.title || s.url,
    url: s.url,
    snippet: s.excerpt,
    kind: "web" as const,
  }));

  return { sources, raw };
}
