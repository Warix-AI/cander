/**
 * Preferred published URL validation (Phase 9/10).
 * Pure helpers — safe for node:test (no path aliases).
 */

function normalizeCustomDomain(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function isValidDomain(domain: string) {
  if (!domain || domain.length > 253) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

export type PreferredUrlContext = {
  canderSubdomain: string | null;
  /** Verified custom domain hostname (no scheme). */
  verifiedCustomDomain?: string | null;
};

/**
 * Resolve a safe published_url. Rejects arbitrary hosts and unverified customs.
 */
export function resolveSafePublishedUrl(opts: {
  preferredUrl?: string | null;
  slug?: string | null;
  ctx: PreferredUrlContext;
  /** Fallback when no preferred (usually vercel deployment URL). */
  fallbackUrl: string;
}): { url: string; reason: "cander" | "custom" | "fallback" } {
  const sub = opts.ctx.canderSubdomain?.trim().toLowerCase() || null;
  const canderUrl = sub ? `https://${sub}.cander.app` : null;
  const verified = opts.ctx.verifiedCustomDomain
    ? normalizeCustomDomain(opts.ctx.verifiedCustomDomain)
    : null;

  const candidates: string[] = [];
  if (opts.preferredUrl?.trim()) candidates.push(opts.preferredUrl.trim());
  if (opts.slug?.trim() && sub) {
    candidates.push(`https://${opts.slug.trim().toLowerCase()}.cander.app`);
  }

  for (const raw of candidates) {
    try {
      const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
      if (u.protocol !== "https:") continue;
      const host = u.hostname.toLowerCase();
      if (host.startsWith("draft--")) continue;
      if (sub && host === `${sub}.cander.app`) {
        return { url: canderUrl!, reason: "cander" };
      }
      if (verified && host === verified && isValidDomain(verified)) {
        return { url: `https://${verified}`, reason: "custom" };
      }
    } catch {
      /* try next */
    }
  }

  if (canderUrl) return { url: canderUrl, reason: "cander" };
  return { url: opts.fallbackUrl, reason: "fallback" };
}

/** Reject custom domains that collide with platform hosts. */
export function isAllowedCustomDomainHost(domain: string): boolean {
  const host = normalizeCustomDomain(domain);
  if (!isValidDomain(host)) return false;
  if (host === "cander.app" || host.endsWith(".cander.app")) return false;
  if (host === "vercel.app" || host.endsWith(".vercel.app")) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  return true;
}
