/**
 * Shared security helpers for desktop browser surfaces.
 * Kept free of Electron imports so Node tests can load it.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

/** Stable partition segment — UUID / ids only; strips odd chars from IPC. */
function sanitizePartitionId(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.slice(0, 128);
}

function partitionFor(options) {
  // `persist:` writes cookies / localStorage / cache to disk — same jar across
  // every project for this Cander account until the site expires the session.
  if (options?.isolatedPartition && options?.projectId) {
    const projectId = sanitizePartitionId(options.projectId) || "project";
    return `persist:cander-preview-${projectId}`;
  }
  const userId = sanitizePartitionId(options?.userId);
  if (userId) {
    return `persist:cander-web-${userId}`;
  }
  // Never invent an anonymous shared jar for signed-in browsing — caller must
  // wait for userId (BrowserSurfaceHost already gates on it).
  return "persist:cander-web";
}

function isAllowedUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed || trimmed === "about:blank") return true;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
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

module.exports = { partitionFor, isAllowedUrl, sanitizePartitionId };
