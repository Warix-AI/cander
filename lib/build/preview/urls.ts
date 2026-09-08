/**
 * Pure preview URL helpers (no server deps — safe for node:test).
 */

const ALLOWED_UPSTREAM_HOST =
  /(\.vercel\.app|\.vercel\.run|\.vm\.vercel|sandbox\.vercel)$/i;

export function isAllowedPreviewUpstreamOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host === "cander.app" || host.endsWith(".cander.app")) return false;
    // Suffix allowlist only (Phase 9 — no substring "vercel" escape hatch).
    return ALLOWED_UPSTREAM_HOST.test(host);
  } catch {
    return false;
  }
}

/** In-app iframe / path proxy base (same origin as Cander). */
export function projectPreviewPath(
  projectId: string,
  workspaceId: string,
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/preview/${encodeURIComponent(workspaceId)}/`;
}

/** Friendly draft host label (DNS/proxy). */
export function draftPreviewHost(subdomain: string): string {
  return `draft--${subdomain}.cander.app`;
}

export function draftPreviewUrl(subdomain: string): string {
  return `https://${draftPreviewHost(subdomain)}`;
}

/** Production public host (Phase 8) — no draft-- prefix. */
export function productionAppHost(subdomain: string): string {
  return `${subdomain}.cander.app`;
}

export function productionAppUrl(subdomain: string): string {
  return `https://${productionAppHost(subdomain)}`;
}

/**
 * Production upstream allowlist — Vercel deployment hosts only (tighter than sandbox).
 * Rejects localhost, cander.app (proxy loops), and non-https.
 */
export function isAllowedProductionUpstreamOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host === "cander.app" || host.endsWith(".cander.app")) return false;
    // Production deploys are *.vercel.app (and occasional vercel DNS aliases).
    return (
      /\.vercel\.app$/i.test(host) ||
      /\.vercel\.sh$/i.test(host) ||
      host === "vercel.app"
    );
  } catch {
    return false;
  }
}

/** Rewrite root-relative URLs so path-based iframe proxies keep assets on Cander. */
export function rewriteHtmlForPreviewProxy(
  html: string,
  prefix: string,
): string {
  const base = prefix.replace(/\/$/, "");
  if (!base) return html;
  return html
    .replace(
      /((?:src|href|action)\s*=\s*["'])\/(?!\/)/gi,
      `$1${base}/`,
    )
    .replace(
      /(url\(\s*['"]?)\/(?!\/)/gi,
      `$1${base}/`,
    )
    .replace(
      /("pathname"\s*:\s*")\//g,
      `$1${base}/`,
    );
}
