/** Safe relative redirect paths for auth callbacks (no open redirects). */
export function safeAuthNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const next = raw.trim();
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  if (next.includes("\\")) return "/";
  if (next.includes("://")) return "/";
  // Block protocol-relative / encoded tricks that still start with "/"
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("://")) {
      return "/";
    }
  } catch {
    return "/";
  }
  return next;
}

/** Keep only workspace IDs that belong to the given org. */
export function filterOrgWorkspaceIds(
  requested: string[] | null | undefined,
  orgOwnedIds: Iterable<string>,
): string[] {
  if (!requested?.length) return [];
  const allowed = new Set(orgOwnedIds);
  return [...new Set(requested.map(String).filter((id) => allowed.has(id)))];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
