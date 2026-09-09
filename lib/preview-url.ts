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
