import type { RetrievalSource } from "./types.ts";

type BraveHit = {
  title: string;
  url: string;
  description: string;
  publishedAt?: string | null;
  source?: string | null;
};

export async function braveWebSearch(opts: {
  query: string;
  count?: number;
  signal?: AbortSignal;
}): Promise<{ sources: RetrievalSource[]; raw: BraveHit[] }> {
  const apiKey = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY missing");
  }
  const query = opts.query.trim().slice(0, 400);
  if (!query) return { sources: [], raw: [] };

  const count = Math.min(opts.count ?? 5, 8);
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const braveRes = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: opts.signal ?? AbortSignal.timeout(20_000),
  });

  if (!braveRes.ok) {
    const detail = await braveRes.text().catch(() => "");
    throw new Error(`Brave search failed (${braveRes.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await braveRes.json()) as {
    web?: { results?: Array<Record<string, unknown>> };
  };
  const results = data.web?.results ?? [];
  const raw: BraveHit[] = results.map((r) => {
    const link = String(r.url ?? "");
    let host: string | null = null;
    try {
      host = new URL(link).hostname.replace(/^www\./, "");
    } catch {
      host = null;
    }
    return {
      title: String(r.title ?? ""),
      url: link,
      description: String(r.description ?? ""),
      publishedAt: r.age ? String(r.age) : null,
      source: host,
    };
  });

  const sources: RetrievalSource[] = raw.map((h, i) => ({
    id: `web_${i + 1}`,
    title: h.title || h.url,
    url: h.url,
    snippet: h.description,
    kind: "web" as const,
  }));

  return { sources, raw };
}
