import {
  draftPreviewUrl,
  productionAppUrl,
} from "@/lib/build/preview/urls";

/**
 * Resolve the browser tab URL for a project.
 * Never invent `{projectId}.cander.app` — that loads the Cander platform
 * inside the embedded preview (login/welcome). Unpublished drafts stay blank
 * until sandbox ensure supplies a draft-- host or path preview.
 */
export function previewUrlForProject(
  _projectId: string,
  publishedUrl?: string | null,
  opts?: { canderSubdomain?: string | null },
) {
  if (publishedUrl?.trim()) return publishedUrl.trim();
  const sub = opts?.canderSubdomain?.trim().toLowerCase();
  if (sub) return productionAppUrl(sub);
  return "about:blank";
}

/** Draft sandbox host once subdomain is known (from infra/sandbox ensure). */
export function draftPreviewUrlForSubdomain(subdomain: string | null | undefined) {
  const sub = subdomain?.trim().toLowerCase();
  if (!sub) return null;
  return draftPreviewUrl(sub);
}

/** True when a URL is an unpublished draft/sandbox host that must not look “live”. */
export function isDraftPreviewUrl(url: string | null | undefined): boolean {
  const raw = (url || "").trim();
  if (!raw || raw === "about:blank") return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host.startsWith("draft--") && host.endsWith(".cander.app")) return true;
    // Legacy bad fallback: uuid.cander.app
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.cander\.app$/i.test(
        host,
      )
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Address-bar value for Build projects.
 * Prefer the published host when available; otherwise show the draft host
 * (starting / failed / live) so the chrome matches preview status.
 */
export function chromeUrlForBuildProject(opts: {
  publishedUrl?: string | null;
  candidateUrl?: string | null;
}): string {
  const published = opts.publishedUrl?.trim();
  if (published && isHttpUrl(published) && !isDraftPreviewUrl(published)) {
    return published;
  }
  const candidate = opts.candidateUrl?.trim() || "";
  if (!candidate || candidate === "about:blank") return "";
  return candidate;
}

export function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" && parsed.port) {
      return `Preview :${parsed.port}`;
    }
    const host = parsed.hostname.replace(/^www\./, "");
    return host || url;
  } catch {
    return url.trim() ? url : "New tab";
  }
}

export function isHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isGoogleUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "google.com" || host.endsWith(".google.com");
  } catch {
    return false;
  }
}

export function displayHostFromUrl(url: string) {
  if (!url || url === "about:blank") return "";
  return titleFromUrl(url);
}

export function faviconUrlForSite(url: string, size = 32) {
  try {
    const host = new URL(url).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
  } catch {
    return null;
  }
}

export function normalizeBrowserUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "https://" || trimmed === "http://") {
    return "about:blank";
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(" ") || !trimmed.includes(".")) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  return `https://${trimmed}`;
}
