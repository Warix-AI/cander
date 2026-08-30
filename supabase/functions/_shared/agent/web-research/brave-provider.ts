/**
 * Brave adapter kept for emergency WEB_RESEARCH_PROVIDER=brave only.
 * Not used when provider=exa. Never auto-selected on Exa failure.
 */
import type {
  WebEvidence,
  WebReadInput,
  WebResearchInput,
  WebResearchProvider,
  WebSearchInput,
} from "../../web-research-contract/types.ts";
import {
  WEB_RESEARCH_LIMITS,
  dedupeSources,
  evidenceTextFromSources,
  makeWebSource,
} from "../../web-research-contract/types.ts";
import { braveApiKey } from "../../web-research-contract/flags.ts";

export function createBraveWebResearchProvider(): WebResearchProvider {
  return {
    id: "brave",

    async search(input: WebSearchInput): Promise<WebEvidence> {
      const apiKey = braveApiKey();
      if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY missing");
      const query = input.query.trim().slice(0, WEB_RESEARCH_LIMITS.maxQueryChars);
      if (!query) {
        return {
          query: "",
          sources: [],
          evidenceText: "",
          provider: "brave",
          mode: "search",
          retrievedAt: new Date().toISOString(),
        };
      }
      const count = Math.min(
        input.count ?? 5,
        WEB_RESEARCH_LIMITS.maxResultsPerRequest,
      );
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(count));

      const braveRes = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
        signal: input.signal ?? AbortSignal.timeout(WEB_RESEARCH_LIMITS.searchTimeoutMs),
      });
      if (!braveRes.ok) {
        const detail = await braveRes.text().catch(() => "");
        throw new Error(
          `Brave search failed (${braveRes.status}): ${detail.slice(0, 200)}`,
        );
      }
      const data = (await braveRes.json()) as {
        web?: { results?: Array<Record<string, unknown>> };
      };
      const retrievedAt = new Date().toISOString();
      const sources = dedupeSources(
        (data.web?.results ?? [])
          .map((r, i) =>
            makeWebSource({
              id: `web_${i + 1}`,
              title: String(r.title ?? ""),
              url: String(r.url ?? ""),
              excerpt: String(r.description ?? ""),
              publishedAt: r.age ? String(r.age) : null,
              sourceType: "search",
              retrievedAt,
            }),
          )
          .filter(Boolean) as NonNullable<
          ReturnType<typeof makeWebSource>
        >[],
      ).slice(0, count);

      return {
        query,
        sources,
        evidenceText: evidenceTextFromSources(sources),
        provider: "brave",
        mode: "search",
        retrievedAt,
      };
    },

    async read(_input: WebReadInput): Promise<WebEvidence> {
      throw new Error(
        "Brave provider does not support Contents. Set WEB_RESEARCH_PROVIDER=exa.",
      );
    },

    async research(_input: WebResearchInput): Promise<WebEvidence> {
      throw new Error(
        "Brave provider does not support deep research. Set WEB_RESEARCH_PROVIDER=exa.",
      );
    },
  };
}
