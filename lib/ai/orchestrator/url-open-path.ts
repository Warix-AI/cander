/**
 * Deterministic explicit-URL open path helpers (execution, not PLAN).
 * detect → normalize → direct fetch → validate domain → summarize
 * On fetch failure: one site: search fallback (not agent-first).
 */

export type NormalizedExplicitUrl = {
  url: string;
  domain: string;
  raw: string;
};

const DOMAIN_LIKE_RE =
  /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s]*)?$/i;

/** Normalize bare domain / URL to a public https URL. */
export function normalizeExplicitUrl(raw: string): NormalizedExplicitUrl | null {
  const input = raw.trim().replace(/[.,!?;:]+$/, "");
  if (!input) return null;

  let candidate = input;
  if (!/^https?:\/\//i.test(candidate)) {
    if (!DOMAIN_LIKE_RE.test(candidate) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(candidate)) {
      return null;
    }
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.protocol === "http:") u.protocol = "https:";
    const domain = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (!domain || domain === "localhost") return null;
    return { url: u.toString(), domain, raw: input };
  } catch {
    return null;
  }
}

/** Common alternate URL to retry after a non-2xx / failed open. */
export function retryNormalizedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const alt = new URL(url);
    if (u.hostname.startsWith("www.")) {
      alt.hostname = u.hostname.slice(4);
    } else {
      alt.hostname = `www.${u.hostname}`;
    }
    // Flip trailing slash on root vs non-root path
    if (alt.pathname === "/" || alt.pathname === "") {
      // keep root; hostname flip is the main retry
    } else if (alt.pathname.endsWith("/")) {
      alt.pathname = alt.pathname.replace(/\/+$/, "") || "/";
    } else {
      alt.pathname = `${alt.pathname}/`;
    }
    const out = alt.toString();
    return out === url ? null : out;
  } catch {
    return null;
  }
}

export function urlHostMatchesRequestedDomain(
  finalUrl: string | null | undefined,
  requestedUrlOrDomain: string | null | undefined,
): boolean {
  if (!finalUrl || !requestedUrlOrDomain) return false;
  const want = normalizeExplicitUrl(requestedUrlOrDomain)?.domain
    ?? requestedUrlOrDomain.replace(/^www\./i, "").toLowerCase();
  try {
    const host = new URL(finalUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return host === want || host.endsWith(`.${want}`);
  } catch {
    return false;
  }
}

/** Exa/web.search fallback query scoped to the exact domain. */
export function siteSearchQueryForUrl(urlOrDomain: string): string {
  const normalized = normalizeExplicitUrl(urlOrDomain);
  const domain = normalized?.domain
    ?? urlOrDomain
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      ?.replace(/^www\./i, "")
      .toLowerCase();
  return `site:${domain || urlOrDomain}`.slice(0, 400);
}

/** True when the user asked for broad / autonomous research (agent ok). */
export function wantsExplicitAgentEscalation(text: string): boolean {
  return /\b(research this for me|investigate thoroughly|do (the|a) (full )?research|comprehensive report|autonomous(ly)?|over (the )?next (few )?(hours|days)|full investigation|gather everything about|write me a (full )?report|deep research|multi[- ]source research)\b/i.test(
    text,
  );
}

/** Inspect / review / summarize a specific site — must not agent-first. */
export function isExplicitWebsiteInspectRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (wantsExplicitAgentEscalation(t)) return false;
  const hasUrl =
    /https?:\/\/[^\s]+/i.test(t) ||
    /\b[a-z0-9][a-z0-9-]*\.(?:com|io|dev|org|net|app|ai|co|hq|us|gov|edu|uk)\b/i.test(
      t,
    );
  if (!hasUrl) return false;
  return /\b(check|look at|review|inspect|summarize|summary|tell me (what|about)|what (?:it|they) (?:offer|do)|explain|describe|visit|open|read)\b/i.test(
    t,
  );
}
