/**
 * Edge helpers for deterministic explicit-URL open (mirrors client url-open-path).
 */

export type NormalizedExplicitUrl = {
  url: string;
  domain: string;
  raw: string;
};

const DOMAIN_LIKE_RE =
  /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s]*)?$/i;

export function normalizeExplicitUrl(raw: string): NormalizedExplicitUrl | null {
  const input = raw.trim().replace(/[.,!?;:]+$/, "");
  if (!input) return null;

  let candidate = input;
  if (!/^https?:\/\//i.test(candidate)) {
    if (
      !DOMAIN_LIKE_RE.test(candidate) &&
      !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(candidate)
    ) {
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

export function retryNormalizedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const alt = new URL(url);
    if (u.hostname.startsWith("www.")) {
      alt.hostname = u.hostname.slice(4);
    } else {
      alt.hostname = `www.${u.hostname}`;
    }
    if (alt.pathname !== "/" && alt.pathname !== "") {
      if (alt.pathname.endsWith("/")) {
        alt.pathname = alt.pathname.replace(/\/+$/, "") || "/";
      } else {
        alt.pathname = `${alt.pathname}/`;
      }
    }
    const out = alt.toString();
    return out === url ? null : out;
  } catch {
    return null;
  }
}

export function urlHostMatchesRequestedDomain(
  finalUrl: string | null | undefined,
  requestedDomain: string | null | undefined,
): boolean {
  if (!finalUrl || !requestedDomain) return false;
  const want = requestedDomain.replace(/^www\./i, "").toLowerCase();
  try {
    const host = new URL(finalUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return host === want || host.endsWith(`.${want}`);
  } catch {
    return false;
  }
}
