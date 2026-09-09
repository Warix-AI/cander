/**
 * SEO/metadata consistency for Website drafts.
 * robots ↔ sitemap (and related refs) must agree before ready / publish.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import type { SiteSpec } from "@/lib/ai/build/site-spec";

const ROBOTS_PATHS = [
  "app/robots.ts",
  "app/robots.js",
  "app/robots.tsx",
  "app/robots.jsx",
  "robots.txt",
  "public/robots.txt",
] as const;

const SITEMAP_PATHS = [
  "app/sitemap.ts",
  "app/sitemap.js",
  "app/sitemap.tsx",
  "app/sitemap.jsx",
  "sitemap.xml",
  "public/sitemap.xml",
] as const;

export function findRobotsPath(paths: Iterable<string>): string | null {
  const set = paths instanceof Set ? paths : new Set(paths);
  for (const p of ROBOTS_PATHS) {
    if (set.has(p)) return p;
  }
  return null;
}

export function findSitemapPath(paths: Iterable<string>): string | null {
  const set = paths instanceof Set ? paths : new Set(paths);
  for (const p of SITEMAP_PATHS) {
    if (set.has(p)) return p;
  }
  return null;
}

/** True when robots content declares a sitemap URL / field. */
export function robotsDeclaresSitemap(robotsContent: string | null | undefined): boolean {
  if (!robotsContent?.trim()) return false;
  // MetadataRoute.Robots: sitemap: "..." | sitemap: ["..."]
  if (/\bsitemap\s*:/i.test(robotsContent)) return true;
  // robots.txt: Sitemap: https://...
  if (/^\s*Sitemap\s*:/im.test(robotsContent)) return true;
  if (/\/sitemap\.xml\b/i.test(robotsContent)) return true;
  return false;
}

export function layoutReferencesSitemap(
  layoutContent: string | null | undefined,
): boolean {
  if (!layoutContent?.trim()) return false;
  return /sitemap\.xml|['"`]\/sitemap['"`]|generateSitemaps/.test(layoutContent);
}

/**
 * Issues when SEO artifacts disagree (shared by validate + publish preflight).
 */
export function seoConsistencyIssues(opts: {
  paths: string[];
  robotsContent?: string | null;
  layoutContent?: string | null;
  /** When false, missing robots/sitemap alone is not an issue (presence checked elsewhere). */
  requireBoth?: boolean;
}): string[] {
  const issues: string[] = [];
  const paths = opts.paths;
  const hasRobots = Boolean(findRobotsPath(paths));
  const hasSitemap = Boolean(findSitemapPath(paths));
  const robotsContent = opts.robotsContent ?? null;
  const layoutContent = opts.layoutContent ?? null;

  if (opts.requireBoth) {
    if (!hasRobots) issues.push("Missing robots (app/robots.ts)");
    if (!hasSitemap) issues.push("Missing sitemap (app/sitemap.ts)");
  }

  if (robotsDeclaresSitemap(robotsContent) && !hasSitemap) {
    issues.push(
      "robots declares Sitemap but tip has no sitemap file (add app/sitemap.ts or remove the sitemap declaration).",
    );
  }

  if (layoutReferencesSitemap(layoutContent) && !hasSitemap) {
    issues.push(
      "Layout references a sitemap but tip has no app/sitemap.* or sitemap.xml.",
    );
  }

  // Sitemap present but robots omits it — still inconsistent for Next MetadataRoute.
  if (hasSitemap && hasRobots && robotsContent && !robotsDeclaresSitemap(robotsContent)) {
    issues.push(
      "app/sitemap exists but robots does not declare sitemap — add sitemap to app/robots.ts.",
    );
  }

  return issues;
}

export function canonicalRobotsTs(): string {
  return `import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "/sitemap.xml",
  };
}
`;
}

export function canonicalSitemapTs(pagePaths: string[]): string {
  const pages =
    pagePaths.length > 0
      ? pagePaths
      : ["/"];
  const entries = pages.map((path) => ({
    url: path.startsWith("/") ? path : `/${path}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
  return `import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ${JSON.stringify(entries, null, 2)} as MetadataRoute.Sitemap;
}
`;
}

function pagePathsFromSpec(spec?: SiteSpec | null): string[] {
  if (!spec?.pages?.length) return ["/"];
  return spec.pages.map((p) => (p.path?.startsWith("/") ? p.path : `/${p.path || ""}`));
}

function pagePathsFromFileMap(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (p === "app/page.tsx" || p === "app/page.ts" || p === "app/page.jsx" || p === "app/page.js") {
      out.add("/");
      continue;
    }
    const m = /^app\/(.+)\/page\.(tsx|ts|jsx|js)$/.exec(p);
    if (m) out.add(`/${m[1]}`);
  }
  return out.size ? [...out] : ["/"];
}

/**
 * Deterministic in-memory repair: ensure robots + sitemap agree.
 * Prefer adding missing sitemap when robots declares it; otherwise write both.
 */
export function repairSeoConsistencyFiles(opts: {
  files: ScaffoldFile[];
  spec?: SiteSpec | null;
}): { files: ScaffoldFile[]; repaired: boolean; issuesFixed: string[] } {
  const byPath = new Map(
    opts.files.map((f) => [f.path.replace(/^\.\//, ""), f] as const),
  );
  const paths = [...byPath.keys()];
  const robotsPath = findRobotsPath(paths);
  const sitemapPath = findSitemapPath(paths);
  const robotsContent = robotsPath ? byPath.get(robotsPath)?.content ?? null : null;
  const before = seoConsistencyIssues({
    paths,
    robotsContent,
    layoutContent: byPath.get("app/layout.tsx")?.content ?? byPath.get("app/layout.js")?.content ?? null,
    requireBoth: true,
  });
  if (before.length === 0) {
    return { files: opts.files, repaired: false, issuesFixed: [] };
  }

  const pages = opts.spec?.pages?.length
    ? pagePathsFromSpec(opts.spec)
    : pagePathsFromFileMap(paths);

  // Always restore canonical App Router SEO pair (atomic consistency).
  byPath.set("app/robots.ts", {
    path: "app/robots.ts",
    content: canonicalRobotsTs(),
  });
  byPath.set("app/sitemap.ts", {
    path: "app/sitemap.ts",
    content: canonicalSitemapTs(pages),
  });

  // Drop conflicting robots.txt that might still declare a remote-only sitemap
  // without App Router sitemap — prefer app/robots.ts.
  for (const stale of ["robots.txt", "public/robots.txt"] as const) {
    if (byPath.has(stale) && byPath.has("app/robots.ts")) {
      byPath.delete(stale);
    }
  }

  const nextFiles = [...byPath.values()];
  const after = seoConsistencyIssues({
    paths: nextFiles.map((f) => f.path),
    robotsContent: canonicalRobotsTs(),
    layoutContent:
      byPath.get("app/layout.tsx")?.content ??
      byPath.get("app/layout.js")?.content ??
      null,
    requireBoth: true,
  });

  return {
    files: nextFiles,
    repaired: true,
    issuesFixed: after.length === 0 ? before : before,
  };
}
