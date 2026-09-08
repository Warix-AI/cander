/**
 * Cander subdomain allocation for *.cander.app (server-side).
 */

const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "docs",
  "status",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "static",
  "assets",
  "preview",
  "draft",
  "prod",
  "production",
  "staging",
  "dev",
  "test",
  "cander",
  "warix",
  "support",
  "help",
  "billing",
  "auth",
  "login",
  "signup",
  "m", // markdown share prefix family
]);

/** Slug suitable as a DNS label (lowercase, hyphens, no leading/trailing hyphen). */
export function slugifySubdomain(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!base) return "app";
  if (/^[0-9]/.test(base)) return `app-${base}`.slice(0, 48);
  return base;
}

export function isReservedSubdomain(slug: string): boolean {
  const s = slug.toLowerCase();
  if (RESERVED.has(s)) return true;
  // Shared markdown hosts: m + 24 alnum
  if (/^m[a-z0-9]{24}$/.test(s)) return true;
  return false;
}

export function isValidSubdomainLabel(slug: string): boolean {
  if (!slug || slug.length > 63) return false;
  if (isReservedSubdomain(slug)) return false;
  // Never allocate draft--* or double-hyphen labels (draft hosts use draft-- prefix).
  if (slug.includes("--") || slug.startsWith("draft")) return false;
  return /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

/**
 * Build candidate list: preferred slug, then slug-suffix, then project-id based.
 */
export function subdomainCandidates(opts: {
  title: string;
  projectId: string;
}): string[] {
  const preferred = slugifySubdomain(opts.title);
  const shortId = opts.projectId.replace(/-/g, "").slice(0, 8).toLowerCase();
  const out: string[] = [];
  const push = (s: string) => {
    if (!isValidSubdomainLabel(s)) return;
    if (!out.includes(s)) out.push(s);
  };
  push(preferred);
  push(`${preferred}-${shortId}`.slice(0, 63));
  push(`p-${shortId}`);
  push(`app-${shortId}`);
  return out;
}
