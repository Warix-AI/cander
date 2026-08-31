import { buildPreviews } from "@/lib/data";

export function previewUrlForProject(
  projectId: string,
  publishedUrl?: string | null,
) {
  if (publishedUrl) return publishedUrl;
  const preview = buildPreviews.find((item) => item.projectId === projectId);
  if (!preview) return `https://${projectId}.cander.app`;
  const slug = preview.name.toLowerCase().replace(/\s+/g, "-");
  return `https://${slug}.cander.app`;
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
