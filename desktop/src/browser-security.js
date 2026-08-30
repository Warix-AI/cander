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

function partitionFor(options) {
  if (options?.isolatedPartition && options?.projectId) {
    return `persist:cander-preview-${options.projectId}`;
  }
  if (options?.userId) {
    return `persist:cander-web-${options.userId}`;
  }
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

module.exports = { partitionFor, isAllowedUrl };
