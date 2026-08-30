/**
 * Web retrieval orchestration — ranking, dedup, sufficiency, exact URL handling.
 * Keep in sync with lib/ai/orchestrator/web-retrieval.ts
 */

import type { EvidenceItem } from "./types.ts";

export type SearchHitLite = {
  title: string;
  url: string;
  description: string;
  publishedAt?: string | null;
  source?: string | null;
};

export type RequestedUrl = {
  url: string;
  domain: string;
  required: boolean;
};

export type RankedHit = SearchHitLite & {
  score: number;
  id: string;
};

export type WebEvidenceSufficiency = {
  sufficient: boolean;
  reason: string;
  needsOpen: boolean;
  needsMoreSearch: boolean;
};

export type TurnRetrievalState = {
  searchedQueries: string[];
  openedUrls: string[];
  requestedExactUrl: string | null;
  exactUrlDomain: string | null;
  exactUrlRequired: boolean;
  exactUrlFailed: boolean;
};

export const SEARCH_SESSION_TTL_MS = 30 * 60 * 1000;

export function initTurnRetrieval(userRequest: string): TurnRetrievalState {
  const requested = extractRequestedUrl(userRequest);
  return {
    searchedQueries: [],
    openedUrls: [],
    requestedExactUrl: requested?.url ?? null,
    exactUrlDomain: requested?.domain ?? null,
    exactUrlRequired: Boolean(requested?.required),
    exactUrlFailed: false,
  };
}

/** Detect when the user wants a specific site opened — not a similarly named company. */
export function extractRequestedUrl(userRequest: string): RequestedUrl | null {
  const text = userRequest.trim();
  if (!text) return null;

  const fullUrl = text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (fullUrl) {
    try {
      const u = new URL(fullUrl);
      const domain = u.hostname.replace(/^www\./i, "").toLowerCase();
      return { url: u.toString(), domain, required: true };
    } catch {
      // fall through
    }
  }

  const directive = text.match(
    /\b(?:view|visit|open|check(?: out)?|see|go to|look at|browse|read)\s+(?:the\s+)?(?:site\s+|website\s+|page\s+at\s+)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s]*)?)/i,
  );
  if (directive?.[1]) {
    const hostPath = directive[1].replace(/[.,!?;:]+$/, "");
    const domain = hostPath.split("/")[0].replace(/^www\./i, "").toLowerCase();
    return {
      url: hostPath.startsWith("http") ? hostPath : `https://${hostPath}`,
      domain,
      required: true,
    };
  }

  const bareDomain = text.match(
    /\b([a-z0-9][a-z0-9-]*\.(?:com|io|dev|org|net|app|ai|co|hq|us|gov|edu))\b/i,
  );
  if (
    bareDomain &&
    /\b(?:what is|tell me about|describe|summarize|website|site|homepage)\b/i.test(
      text,
    )
  ) {
    const domain = bareDomain[1].replace(/^www\./i, "").toLowerCase();
    return { url: `https://${domain}`, domain, required: true };
  }

  return null;
}

export function normalizeUrlKey(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function normalizeQueryKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function dedupeQueries(
  queries: string[],
  seen: string[],
): { queries: string[]; skipped: string[] } {
  const seenSet = new Set(seen.map(normalizeQueryKey));
  const out: string[] = [];
  const skipped: string[] = [];
  for (const q of queries) {
    const key = normalizeQueryKey(q);
    if (!key || seenSet.has(key)) {
      skipped.push(q);
      continue;
    }
    seenSet.add(key);
    out.push(q.trim());
  }
  return { queries: out, skipped };
}

export function urlHostMatchesDomain(
  url: string | null | undefined,
  domain: string | null | undefined,
): boolean {
  if (!url || !domain) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    const want = domain.replace(/^www\./i, "").toLowerCase();
    return host === want || host.endsWith(`.${want}`);
  } catch {
    return false;
  }
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function lexicalOverlap(query: string, blob: string): number {
  const q = tokens(query);
  if (q.size === 0) return 1;
  const st = tokens(blob);
  let hit = 0;
  for (const t of q) {
    if (st.has(t)) hit++;
  }
  return hit / q.size;
}

const AGGREGATOR_HOSTS = new Set([
  "wikipedia.org",
  "reddit.com",
  "quora.com",
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "crunchbase.com",
  "glassdoor.com",
]);

function hostAuthorityScore(hostname: string): number {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  if (h.endsWith(".gov") || h.endsWith(".edu")) return 0.25;
  if (AGGREGATOR_HOSTS.has(h)) return -0.15;
  if (h.split(".").length === 2) return 0.1;
  return 0;
}

function recencyScore(publishedAt?: string | null): number {
  if (!publishedAt) return 0;
  const lower = publishedAt.toLowerCase();
  if (/\b(hour|minute|today|just now)\b/.test(lower)) return 0.3;
  if (/\b(day|yesterday)\b/.test(lower)) return 0.2;
  if (/\b(week|month)\b/.test(lower)) return 0.1;
  return 0.05;
}

/** Rank search hits — snippets are discovery metadata, not final evidence. */
export function rankSearchHits(
  userRequest: string,
  hits: SearchHitLite[],
  opts?: {
    requestedDomain?: string | null;
    startId?: string;
  },
): RankedHit[] {
  const requestedDomain = opts?.requestedDomain?.toLowerCase() ?? null;
  const qTokens = tokens(userRequest);

  const scored = hits.map((hit, index) => {
    let score = 0;
    let host = "";
    try {
      host = new URL(hit.url).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      host = "";
    }

    score += lexicalOverlap(userRequest, `${hit.title} ${hit.description} ${hit.url}`) * 0.45;
    score += hostAuthorityScore(host);
    score += recencyScore(hit.publishedAt);

    if (requestedDomain && host === requestedDomain) score += 1.5;
    if (requestedDomain && host.endsWith(`.${requestedDomain}`)) score += 0.8;

    // Prefer official/primary when query mentions a domain
    for (const t of qTokens) {
      if (t.includes(".") && host.includes(t.replace(/\./g, ""))) score += 0.2;
      if (host.startsWith(`${t}.`) || host === `${t}.com`) score += 0.35;
    }

    // Slight preference for earlier result order as tie-breaker
    score += Math.max(0, 0.08 - index * 0.015);

    return {
      ...hit,
      score,
      id: `${opts?.startId ?? "web"}_${index + 1}`,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function searchHitToEvidence(
  hit: RankedHit,
  sessionId?: string | null,
): EvidenceItem {
  return {
    id: hit.id,
    kind: "web_search",
    title: hit.title || hit.url,
    url: hit.url,
    content: hit.description,
    publishedAt: hit.publishedAt ?? null,
    retrievedAt: new Date().toISOString(),
    sourceSessionId: sessionId ?? null,
    metadata: { discoveryOnly: true, rankScore: hit.score },
  };
}

export function pageToEvidence(opts: {
  id: string;
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  fromSourceId?: string;
  publishedAt?: string | null;
}): EvidenceItem {
  return {
    id: opts.id,
    kind: "web_page",
    title: opts.title,
    url: opts.finalUrl || opts.url,
    content: opts.text,
    publishedAt: opts.publishedAt ?? null,
    retrievedAt: new Date().toISOString(),
    metadata: { from: opts.fromSourceId, fetchedFrom: opts.url },
  };
}

export function selectSourcesToOpen(
  userRequest: string,
  evidence: EvidenceItem[],
  openedUrls: string[],
  limit = 3,
): string[] {
  const opened = new Set(openedUrls.map(normalizeUrlKey));
  const candidates = evidence.filter(
    (e) => e.kind === "web_search" && e.url && !opened.has(normalizeUrlKey(e.url)),
  );

  const ranked = candidates
    .map((e) => ({
      id: e.id,
      score:
        (typeof e.metadata?.rankScore === "number" ? e.metadata.rankScore : 0) +
        lexicalOverlap(userRequest, `${e.title ?? ""} ${e.content} ${e.url ?? ""}`) * 0.2,
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map((r) => r.id);
}

export function isNontrivialWebQuestion(userRequest: string): boolean {
  const t = userRequest.trim();
  if (!t) return false;
  if (extractRequestedUrl(t)) return true;
  if (/\b(latest|current|today|ceo|price|news|weather|who is|what is|how much)\b/i.test(t)) {
    return true;
  }
  return t.split(/\s+/).length >= 4;
}

export function checkWebEvidenceSufficiency(opts: {
  userRequest: string;
  evidence: EvidenceItem[];
  retrieval: TurnRetrievalState;
}): WebEvidenceSufficiency {
  const { userRequest, evidence, retrieval } = opts;
  const pages = evidence.filter((e) => e.kind === "web_page" && e.content.trim());
  const snippets = evidence.filter((e) => e.kind === "web_search");

  if (retrieval.exactUrlRequired && retrieval.exactUrlFailed) {
    const hasExactPage = pages.some((p) =>
      urlHostMatchesDomain(p.url, retrieval.exactUrlDomain)
    );
    if (!hasExactPage) {
      return {
        sufficient: false,
        reason: "exact_url_unavailable",
        needsOpen: false,
        needsMoreSearch: false,
      };
    }
  }

  if (retrieval.exactUrlRequired && retrieval.exactUrlDomain) {
    const hasExactPage = pages.some((p) =>
      urlHostMatchesDomain(p.url, retrieval.exactUrlDomain)
    );
    if (!hasExactPage && pages.length === 0 && snippets.length === 0) {
      return {
        sufficient: false,
        reason: "exact_url_not_fetched",
        needsOpen: true,
        needsMoreSearch: false,
      };
    }
    if (!hasExactPage && snippets.some((s) =>
      urlHostMatchesDomain(s.url, retrieval.exactUrlDomain)
    )) {
      return {
        sufficient: false,
        reason: "exact_url_snippet_only",
        needsOpen: true,
        needsMoreSearch: false,
      };
    }
    if (hasExactPage) {
      return {
        sufficient: true,
        reason: "exact_page_loaded",
        needsOpen: false,
        needsMoreSearch: false,
      };
    }
  }

  if (pages.length === 0 && snippets.length === 0 && isNontrivialWebQuestion(userRequest)) {
    return {
      sufficient: false,
      reason: "no_evidence",
      needsOpen: false,
      needsMoreSearch: true,
    };
  }

  const hosts = new Set(
    snippets.map((s) => {
      try {
        return new URL(s.url ?? "").hostname;
      } catch {
        return "";
      }
    }).filter(Boolean),
  );
  if (
    hosts.size >= 3 &&
    pages.length < 2 &&
    /\b(conflict|compare|versus|vs\.?|which)\b/i.test(userRequest)
  ) {
    return {
      sufficient: false,
      reason: "conflicting_sources",
      needsOpen: true,
      needsMoreSearch: true,
    };
  }

  if (pages.length === 0 && snippets.length > 0 && isNontrivialWebQuestion(userRequest)) {
    return {
      sufficient: false,
      reason: "snippets_only",
      needsOpen: true,
      needsMoreSearch: false,
    };
  }

  const pageBlob = pages.map((p) => `${p.title ?? ""} ${p.content}`).join(" ");
  const overlap = lexicalOverlap(userRequest, pageBlob);
  if (pages.length > 0 && overlap < 0.08 && isNontrivialWebQuestion(userRequest)) {
    return {
      sufficient: false,
      reason: "weak_page_overlap",
      needsOpen: false,
      needsMoreSearch: true,
    };
  }

  if (/\bceo\b|\bfounder\b|\bpresident\b/i.test(userRequest) && pages.length > 0) {
    const joined = pageBlob;
    const hasPersonish =
      /\b(ceo|chief executive|founder|president)\b/i.test(joined) ||
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(joined);
    if (!hasPersonish) {
      return {
        sufficient: false,
        reason: "missing_entity_in_pages",
        needsOpen: false,
        needsMoreSearch: true,
      };
    }
  }

  if (pages.length > 0 || !isNontrivialWebQuestion(userRequest)) {
    return {
      sufficient: true,
      reason: pages.length ? "pages_loaded" : "trivial",
      needsOpen: false,
      needsMoreSearch: false,
    };
  }

  return {
    sufficient: false,
    reason: "insufficient",
    needsOpen: true,
    needsMoreSearch: true,
  };
}

export function refineSearchQueries(
  userRequest: string,
  priorQueries: string[],
  reason: string,
): string[] {
  const base = userRequest.trim().slice(0, 160);
  const dateStr = new Date().toISOString().slice(0, 10);
  const out: string[] = [];

  if (reason === "missing_entity_in_pages" || reason === "weak_page_overlap") {
    out.push(`${base} ${dateStr}`.slice(0, 180));
    out.push(`${base} official site`.slice(0, 180));
  } else if (reason === "conflicting_sources") {
    out.push(`${base} official`.slice(0, 180));
    out.push(`${base} primary source ${dateStr}`.slice(0, 180));
  } else if (reason === "no_evidence") {
    out.push(base.slice(0, 180));
  } else {
    out.push(`${base} ${dateStr}`.slice(0, 180));
  }

  const { queries } = dedupeQueries(out, priorQueries);
  return queries.slice(0, 3);
}

export type CachedSearchSession = {
  id: string;
  queries: string[];
  results: SearchHitLite[];
  createdAt: string;
};

export function isSearchSessionFresh(
  createdAt: string,
  nowMs = Date.now(),
): boolean {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return nowMs - t <= SEARCH_SESSION_TTL_MS;
}

/** Reuse a recent search session on follow-up questions when still fresh. */
export function shouldReuseSearchSession(opts: {
  userRequest: string;
  priorTopic?: string | null;
  session?: CachedSearchSession | null;
}): boolean {
  if (!opts.session || !isSearchSessionFresh(opts.session.createdAt)) return false;
  const q = opts.userRequest.toLowerCase();
  if (/\b(latest|today|now|current|updated|just|new)\b/i.test(q)) return false;
  if (extractRequestedUrl(opts.userRequest)) return false;
  if (opts.priorTopic && lexicalOverlap(opts.userRequest, opts.priorTopic) >= 0.2) {
    return true;
  }
  if (opts.session.queries.some((sq) => lexicalOverlap(opts.userRequest, sq) >= 0.35)) {
    return true;
  }
  return false;
}

export function hydrateEvidenceFromSession(
  session: CachedSearchSession,
  userRequest: string,
  requestedDomain?: string | null,
): EvidenceItem[] {
  const ranked = rankSearchHits(userRequest, session.results, {
    requestedDomain,
    startId: `reuse_${session.id.slice(0, 8)}`,
  });
  return ranked.map((hit) =>
    searchHitToEvidence(hit, session.id)
  );
}

export function exactUrlFailureMessage(url: string): string {
  return `I couldn't retrieve the page at ${url}. I won't guess what's on that site — please check the URL or try again.`;
}
