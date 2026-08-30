/**
 * Exa Search / Contents / Deep provider.
 * Server-only — never import into client bundles.
 */
import type {
  WebEvidence,
  WebReadInput,
  WebResearchInput,
  WebResearchProvider,
  WebSearchInput,
  WebSource,
  WebDeepLevel,
} from "../../web-research-contract/types.ts";
import {
  WEB_RESEARCH_LIMITS,
  assertPublicHttpUrl,
  dedupeSources,
  evidenceTextFromSources,
  isFreshnessQuery,
  makeWebSource,
} from "../../web-research-contract/types.ts";
import {
  exaApiKey,
  exaDeepSearchEnabled,
  webResearchEnabled,
} from "../../web-research-contract/flags.ts";
import {
  assertWithinQuota,
  cacheKey,
  createServiceSupabase,
  getCachedEvidence,
  recordEvent,
  recordUsage,
  setCachedEvidence,
} from "./durable-store.ts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";

type ExaResultRow = {
  title?: string;
  url?: string;
  id?: string;
  author?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
};

type ExaResponse = {
  requestId?: string;
  results?: ExaResultRow[];
  costDollars?: number | { total?: number };
};

function costFromExa(data: ExaResponse): number | undefined {
  if (typeof data.costDollars === "number") return data.costDollars;
  if (data.costDollars && typeof data.costDollars.total === "number") {
    return data.costDollars.total;
  }
  return undefined;
}

function mapRows(
  rows: ExaResultRow[],
  sourceType: WebSource["sourceType"],
  retrievedAt: string,
): WebSource[] {
  const out: WebSource[] = [];
  rows.forEach((row, i) => {
    const excerpt =
      (Array.isArray(row.highlights) && row.highlights.length
        ? row.highlights.join(" … ")
        : null) ||
      row.summary ||
      row.text ||
      "";
    const src = makeWebSource({
      id: `web_${i + 1}`,
      title: String(row.title ?? ""),
      url: String(row.url ?? ""),
      excerpt: excerpt.slice(0, WEB_RESEARCH_LIMITS.maxExcerptChars),
      author: row.author,
      publishedAt: row.publishedDate ?? null,
      sourceType,
      retrievedAt,
    });
    if (src) out.push(src);
  });
  return dedupeSources(out);
}

async function exaFetch(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ExaResponse> {
  const apiKey = exaApiKey();
  if (!apiKey) throw new Error("EXA_API_KEY missing");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Exa request failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }
    return (await res.json()) as ExaResponse;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function requireEnabled() {
  if (!webResearchEnabled()) {
    throw new Error("Web research is disabled.");
  }
  if (!exaApiKey()) {
    throw new Error("EXA_API_KEY missing");
  }
}

export function createExaWebResearchProvider(): WebResearchProvider {
  return {
    id: "exa",

    async search(input: WebSearchInput): Promise<WebEvidence> {
      requireEnabled();
      const query = input.query.trim().slice(0, WEB_RESEARCH_LIMITS.maxQueryChars);
      if (!query) {
        return {
          query: "",
          sources: [],
          evidenceText: "",
          provider: "exa",
          mode: "search",
          retrievedAt: new Date().toISOString(),
          warnings: ["Empty query"],
        };
      }

      const count = Math.min(
        input.count ?? 5,
        WEB_RESEARCH_LIMITS.maxResultsPerRequest,
      );
      const sb = createServiceSupabase();
      const started = Date.now();
      const freshness = isFreshnessQuery(query);
      const key = cacheKey({
        provider: "exa",
        mode: "search",
        query,
        extra: JSON.stringify({
          count,
          include: input.includeDomains ?? [],
          start: input.startPublishedDate ?? "",
        }),
      });

      if (sb && input.ownerId) {
        const quota = await assertWithinQuota(sb, {
          ownerId: input.ownerId,
          workspaceId: input.workspaceId,
          mode: "search",
        });
        if (!quota.ok) throw new Error(quota.error);
      }

      if (sb && !input.bypassCache && !freshness) {
        const cached = await getCachedEvidence(sb, key);
        if (cached) {
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "search",
            status: "cache_hit",
            latencyMs: Date.now() - started,
            resultCount: cached.sources.length,
          });
          return { ...cached, warnings: [...(cached.warnings ?? []), "cache_hit"] };
        }
      }

      const body: Record<string, unknown> = {
        query,
        type: "auto",
        numResults: count,
        contents: { highlights: true, text: { maxCharacters: 1200 } },
      };
      if (input.includeDomains?.length) {
        body.includeDomains = input.includeDomains.slice(0, 5);
      }
      if (input.excludeDomains?.length) {
        body.excludeDomains = input.excludeDomains.slice(0, 5);
      }
      if (input.startPublishedDate) {
        body.startPublishedDate = input.startPublishedDate;
      } else if (freshness) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 14);
        body.startPublishedDate = d.toISOString().slice(0, 10);
      }

      try {
        const data = await exaFetch(
          EXA_SEARCH_URL,
          body,
          WEB_RESEARCH_LIMITS.searchTimeoutMs,
          input.signal,
        );
        const retrievedAt = new Date().toISOString();
        const sources = mapRows(data.results ?? [], "search", retrievedAt).slice(
          0,
          count,
        );
        const cost = costFromExa(data);
        const evidence: WebEvidence = {
          query,
          sources,
          evidenceText: evidenceTextFromSources(sources),
          provider: "exa",
          mode: "search",
          retrievedAt,
          requestId: data.requestId,
          costDollars: cost,
          truncated: (data.results?.length ?? 0) > sources.length,
        };

        if (sb) {
          if (input.ownerId) {
            await recordUsage(sb, {
              ownerId: input.ownerId,
              workspaceId: input.workspaceId,
              mode: "search",
              costDollars: cost,
            });
          }
          if (!freshness && !input.bypassCache) {
            await setCachedEvidence(sb, {
              key,
              provider: "exa",
              mode: "search",
              evidence,
              ttlSec: freshness
                ? WEB_RESEARCH_LIMITS.cacheTtlNewsSec
                : WEB_RESEARCH_LIMITS.cacheTtlStableSec,
            });
          }
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "search",
            status: "ok",
            exaRequestId: data.requestId,
            latencyMs: Date.now() - started,
            resultCount: sources.length,
            costDollars: cost,
          });
        }
        return evidence;
      } catch (err) {
        if (sb) {
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "search",
            status: "error",
            latencyMs: Date.now() - started,
            errorClass: err instanceof Error ? err.message.slice(0, 80) : "error",
          });
        }
        throw err;
      }
    },

    async read(input: WebReadInput): Promise<WebEvidence> {
      requireEnabled();
      const urls = input.urls
        .slice(0, WEB_RESEARCH_LIMITS.maxContentsPages)
        .map((u) => assertPublicHttpUrl(u));
      if (!urls.length) {
        throw new Error("No public URLs to read.");
      }

      const sb = createServiceSupabase();
      const started = Date.now();
      const maxChars =
        input.maxCharacters ?? WEB_RESEARCH_LIMITS.maxRetrievedChars;
      const key = cacheKey({
        provider: "exa",
        mode: "contents",
        urls,
        query: input.query,
      });

      if (sb && input.ownerId) {
        const quota = await assertWithinQuota(sb, {
          ownerId: input.ownerId,
          workspaceId: input.workspaceId,
          mode: "contents",
        });
        if (!quota.ok) throw new Error(quota.error);
      }

      if (sb && !input.bypassCache) {
        const cached = await getCachedEvidence(sb, key);
        if (cached) {
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "contents",
            status: "cache_hit",
            latencyMs: Date.now() - started,
            resultCount: cached.sources.length,
          });
          return cached;
        }
      }

      try {
        const data = await exaFetch(
          EXA_CONTENTS_URL,
          {
            urls,
            text: { maxCharacters: Math.min(maxChars, 12_000) },
            highlights: input.query
              ? { query: input.query, maxCharacters: 2000 }
              : true,
          },
          WEB_RESEARCH_LIMITS.contentsTimeoutMs,
          input.signal,
        );
        const retrievedAt = new Date().toISOString();
        const sources = mapRows(data.results ?? [], "page", retrievedAt);
        if (!sources.length) {
          throw new Error(
            "Could not retrieve page content from Exa for that URL.",
          );
        }
        const cost = costFromExa(data);
        const evidence: WebEvidence = {
          query: input.query,
          sources,
          evidenceText: evidenceTextFromSources(sources, maxChars),
          provider: "exa",
          mode: "contents",
          retrievedAt,
          requestId: data.requestId,
          costDollars: cost,
        };

        if (sb) {
          if (input.ownerId) {
            await recordUsage(sb, {
              ownerId: input.ownerId,
              workspaceId: input.workspaceId,
              mode: "contents",
              costDollars: cost,
            });
          }
          if (!input.bypassCache) {
            await setCachedEvidence(sb, {
              key,
              provider: "exa",
              mode: "contents",
              evidence,
              ttlSec: WEB_RESEARCH_LIMITS.cacheTtlStableSec,
            });
          }
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "contents",
            status: "ok",
            exaRequestId: data.requestId,
            latencyMs: Date.now() - started,
            resultCount: sources.length,
            costDollars: cost,
          });
        }
        return evidence;
      } catch (err) {
        if (sb) {
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "contents",
            status: "error",
            latencyMs: Date.now() - started,
            errorClass: err instanceof Error ? err.message.slice(0, 80) : "error",
          });
        }
        throw err;
      }
    },

    async research(input: WebResearchInput): Promise<WebEvidence> {
      requireEnabled();
      if (!exaDeepSearchEnabled()) {
        throw new Error(
          "Deep research is not enabled yet. Try a normal web search, or ask an admin to enable EXA_DEEP_SEARCH_ENABLED.",
        );
      }
      const query = input.query.trim().slice(0, WEB_RESEARCH_LIMITS.maxQueryChars);
      if (!query) throw new Error("Empty research query.");

      const level: WebDeepLevel = input.level ?? "deep";
      const count = Math.min(
        input.count ?? 6,
        WEB_RESEARCH_LIMITS.maxResultsPerRequest,
      );
      const sb = createServiceSupabase();
      const started = Date.now();

      if (sb && input.ownerId) {
        const quota = await assertWithinQuota(sb, {
          ownerId: input.ownerId,
          workspaceId: input.workspaceId,
          mode: "deep",
        });
        if (!quota.ok) throw new Error(quota.error);
      }

      try {
        const data = await exaFetch(
          EXA_SEARCH_URL,
          {
            query,
            type: level,
            numResults: count,
            contents: { highlights: true, text: { maxCharacters: 2000 } },
          },
          WEB_RESEARCH_LIMITS.deepTimeoutMs,
          input.signal,
        );
        const retrievedAt = new Date().toISOString();
        const sources = mapRows(
          data.results ?? [],
          "deep-research",
          retrievedAt,
        );
        const cost = costFromExa(data);
        const evidence: WebEvidence = {
          query,
          sources,
          evidenceText: evidenceTextFromSources(sources),
          provider: "exa",
          mode: "deep",
          retrievedAt,
          requestId: data.requestId,
          costDollars: cost,
        };

        if (sb && input.ownerId) {
          await recordUsage(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            mode: "deep",
            costDollars: cost,
          });
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "deep",
            status: "ok",
            exaRequestId: data.requestId,
            latencyMs: Date.now() - started,
            resultCount: sources.length,
            costDollars: cost,
          });
        }
        return evidence;
      } catch (err) {
        if (sb) {
          await recordEvent(sb, {
            ownerId: input.ownerId,
            workspaceId: input.workspaceId,
            provider: "exa",
            mode: "deep",
            status: "error",
            latencyMs: Date.now() - started,
            errorClass: err instanceof Error ? err.message.slice(0, 80) : "error",
          });
        }
        throw err;
      }
    },
  };
}
