/**
 * Provider-neutral web research contract.
 * Dependency-free — importable from Deno Edge and Next (no path aliases).
 * Edge provider implementation is authoritative for runtime behavior.
 */

export type WebSourceType = "search" | "page" | "deep-research";

export type WebResearchMode = "search" | "contents" | "deep";

export type WebDeepLevel = "deep-lite" | "deep" | "deep-reasoning";

export type WebSource = {
  id: string;
  title: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  excerpt?: string;
  author?: string;
  publishedAt?: string;
  retrievedAt: string;
  sourceType: WebSourceType;
};

export type WebEvidence = {
  query?: string;
  sources: WebSource[];
  evidenceText: string;
  provider: "exa" | "brave";
  mode: WebResearchMode;
  retrievedAt: string;
  warnings?: string[];
  requestId?: string;
  costDollars?: number;
  truncated?: boolean;
};

export type WebSearchInput = {
  query: string;
  count?: number;
  /** Prefer official / named domains when known. */
  includeDomains?: string[];
  excludeDomains?: string[];
  /** ISO date lower bound for freshness-sensitive queries. */
  startPublishedDate?: string;
  signal?: AbortSignal;
  ownerId?: string;
  workspaceId?: string | null;
  bypassCache?: boolean;
};

export type WebReadInput = {
  urls: string[];
  query?: string;
  maxCharacters?: number;
  signal?: AbortSignal;
  ownerId?: string;
  workspaceId?: string | null;
  bypassCache?: boolean;
};

export type WebResearchInput = {
  query: string;
  level?: WebDeepLevel;
  count?: number;
  signal?: AbortSignal;
  ownerId?: string;
  workspaceId?: string | null;
  bypassCache?: boolean;
};

export type WebResearchProviderId = "exa" | "brave";

export interface WebResearchProvider {
  readonly id: WebResearchProviderId;
  search(input: WebSearchInput): Promise<WebEvidence>;
  read(input: WebReadInput): Promise<WebEvidence>;
  research(input: WebResearchInput): Promise<WebEvidence>;
}

/** Hard caps — enforced server-side. */
export const WEB_RESEARCH_LIMITS = {
  maxQueryChars: 400,
  maxResultsPerRequest: 8,
  maxContentsPages: 3,
  maxRetrievedChars: 24_000,
  maxExcerptChars: 800,
  searchTimeoutMs: 25_000,
  contentsTimeoutMs: 30_000,
  deepTimeoutMs: 60_000,
  searchesPerUserPerMinute: 20,
  dailyWorkspaceSearchBudget: 200,
  dailyWorkspaceContentsBudget: 100,
  dailyWorkspaceDeepBudget: 10,
  cacheTtlNewsSec: 5 * 60,
  cacheTtlStableSec: 60 * 60,
} as const;

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "";
  } catch {
    return "";
  }
}

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Strip common tracking params
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$/i.test(key)) u.searchParams.delete(key);
    }
    let out = u.toString();
    if (out.endsWith("/") && u.pathname !== "/") {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return url.trim();
  }
}

export function sanitizeHttpUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

export function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  // IPv4 private / link-local / metadata
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function assertPublicHttpUrl(url: string): string {
  const safe = sanitizeHttpUrl(url);
  if (!safe) {
    throw new Error("Only http(s) URLs are allowed.");
  }
  const host = new URL(safe).hostname;
  if (isPrivateOrBlockedHost(host)) {
    throw new Error("That URL is not reachable for public web research.");
  }
  return safe;
}

export function dedupeSources(sources: WebSource[]): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const s of sources) {
    const key = (s.canonicalUrl || s.url).replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function makeWebSource(input: {
  id: string;
  title: string;
  url: string;
  excerpt?: string;
  author?: string;
  publishedAt?: string | null;
  sourceType: WebSourceType;
  retrievedAt?: string;
}): WebSource | null {
  const url = sanitizeHttpUrl(input.url);
  if (!url) return null;
  try {
    assertPublicHttpUrl(url);
  } catch {
    return null;
  }
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  return {
    id: input.id,
    title: (input.title || url).slice(0, 200),
    url,
    canonicalUrl: canonicalUrl(url),
    domain: domainFromUrl(url),
    excerpt: input.excerpt?.slice(0, WEB_RESEARCH_LIMITS.maxExcerptChars),
    author: input.author?.slice(0, 120),
    publishedAt: input.publishedAt ?? undefined,
    retrievedAt,
    sourceType: input.sourceType,
  };
}

export function evidenceTextFromSources(
  sources: WebSource[],
  maxChars = WEB_RESEARCH_LIMITS.maxRetrievedChars,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const s of sources) {
    const block = [
      `[${s.id}] ${s.title} (${s.url})`,
      s.publishedAt ? `Published: ${s.publishedAt}` : null,
      s.excerpt || "",
    ]
      .filter(Boolean)
      .join("\n");
    if (used + block.length > maxChars) {
      parts.push(block.slice(0, Math.max(0, maxChars - used)));
      break;
    }
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join("\n\n").trim();
}

export function isFreshnessQuery(query: string): boolean {
  return /\b(latest|today|tonight|current|recent|now|this\s+week|breaking|just\s+announced)\b/i.test(
    query,
  );
}
