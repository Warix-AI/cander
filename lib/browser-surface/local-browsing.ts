/**
 * Shared local-browser security helpers for Electron / Capacitor / PWA.
 * Keep desktop/src/browser-surface.js partition + URL rules aligned with these.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

const DANGEROUS_PROTOCOLS = new Set([
  "file:",
  "javascript:",
  "data:",
  "blob:",
  "vbscript:",
]);

/** Hosts safe to iframe in the web PWA (first-party + known preview). */
const EMBED_HOST_RE =
  /(^|\.)(cander\.app|canderhq\.com|cander\.vercel\.app)$/i;
const PREVIEW_HOST_RE = /\.vercel\.(app|run)$/i;

export function isDangerousBrowserProtocol(raw: string): boolean {
  try {
    const protocol = new URL(raw.trim()).protocol.toLowerCase();
    return DANGEROUS_PROTOCOLS.has(protocol);
  } catch {
    return true;
  }
}

/** URLs allowed for in-panel local browsing (Electron / Capacitor). */
export function isAllowedLocalBrowserUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "about:blank") return true;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return false;
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function assertAllowedLocalBrowserUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!isAllowedLocalBrowserUrl(trimmed)) {
    throw new Error("URL not allowed for local browser surface.");
  }
  return trimmed;
}

/**
 * Session partition / data-store key.
 * Ordinary web: one durable jar per Cander user (cookies survive tab close,
 * project switches, and app relaunch — Discord stays signed in).
 * Previews: isolated per project (no cookie bleed into personal browsing).
 */
export function localBrowserPartition(options: {
  userId?: string | null;
  projectId?: string | null;
  isolatedPartition?: boolean;
}): string {
  if (options.isolatedPartition && options.projectId) {
    return `persist:cander-preview-${options.projectId}`;
  }
  if (options.userId) {
    return `persist:cander-web-${options.userId}`;
  }
  return "persist:cander-web";
}

/** Non-persistent store name for isolated iOS previews. */
export function iosPreviewDataStoreId(projectId: string): string {
  return `cander-preview-${projectId}`;
}

export function canEmbedInPwa(url: string, previewOnly?: boolean): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (EMBED_HOST_RE.test(parsed.hostname)) {
      return true;
    }
    // Google home is a custom in-app surface, not an iframe.
    if (
      parsed.hostname === "www.google.com" ||
      parsed.hostname === "google.com"
    ) {
      return false;
    }
    if (previewOnly) {
      return PREVIEW_HOST_RE.test(parsed.hostname);
    }
    // Unknown third parties: never silently iframe.
    return false;
  } catch {
    return false;
  }
}
