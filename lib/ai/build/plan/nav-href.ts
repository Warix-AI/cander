/**
 * Nav href helpers — treat same-page anchors as non-routes.
 */

/** True for external / mailto / tel links. */
export function isExternalNavHref(href: string): boolean {
  const h = href.trim();
  return (
    !h ||
    h.startsWith("http://") ||
    h.startsWith("https://") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:")
  );
}

/**
 * Path portion of a nav href for App Router / sitemap checks.
 * `/#services` → `/`; `/about#team` → `/about`; `#hero` → null (hash-only).
 */
export function navHrefRoutePath(href: string): string | null {
  const h = href.trim();
  if (!h || isExternalNavHref(h)) return null;
  if (h.startsWith("#")) return null;
  const pathOnly = (h.split("#")[0] || "/").trim();
  if (!pathOnly || pathOnly === "/") return "/";
  return pathOnly.replace(/\/$/, "") || "/";
}

/** Same-page hash target (`#x` or `/#x`), if any. */
export function navHrefHashId(href: string): string | null {
  const h = href.trim();
  const i = h.indexOf("#");
  if (i < 0) return null;
  const id = h.slice(i + 1).trim();
  return id || null;
}
