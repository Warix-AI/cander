/**
 * Next.js App Router route file conflict helpers.
 * Prefer a single TS/TSX file per route segment; never leave competing .js/.jsx siblings.
 */

export const APP_ROUTER_SEGMENT_FILES = [
  "page",
  "layout",
  "template",
  "default",
  "loading",
  "error",
  "not-found",
  "route",
  "robots",
  "sitemap",
  "opengraph-image",
  "twitter-image",
  "icon",
  "apple-icon",
] as const;

export const APP_ROUTER_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;

export type AppRouterExtension = (typeof APP_ROUTER_EXTENSIONS)[number];

const SEGMENT_RE = new RegExp(
  `^(app(?:\\/.*)?)\\/(${APP_ROUTER_SEGMENT_FILES.join("|")})(\\.(?:tsx|ts|jsx|js))$`,
);

export type AppRouteFileRef = {
  path: string;
  dir: string;
  segment: string;
  ext: AppRouterExtension;
  /** Stable key: `app/page` or `app/about/page` */
  key: string;
};

export function parseAppRouterFile(path: string): AppRouteFileRef | null {
  const normalized = path.replace(/^\.\//, "").replace(/\\/g, "/");
  const m = normalized.match(SEGMENT_RE);
  if (!m) return null;
  const dir = m[1]!;
  const segment = m[2]!;
  const ext = m[3]! as AppRouterExtension;
  return {
    path: normalized,
    dir,
    segment,
    ext,
    key: `${dir}/${segment}`,
  };
}

/** Preferred extension when emitting scaffolds: pages/layouts → tsx; metadata routes → ts. */
export function preferredAppRouterExt(segment: string): AppRouterExtension {
  if (
    segment === "robots" ||
    segment === "sitemap" ||
    segment === "route" ||
    segment === "opengraph-image" ||
    segment === "twitter-image" ||
    segment === "icon" ||
    segment === "apple-icon"
  ) {
    return ".ts";
  }
  return ".tsx";
}

/**
 * Paths that conflict with a preferred write (same route key, different extension).
 * Always includes sibling extensions even if not yet on tip — safe for git delete (noop if missing).
 */
export function conflictingSiblingPaths(preferredPath: string): string[] {
  const ref = parseAppRouterFile(preferredPath);
  if (!ref) return [];
  return APP_ROUTER_EXTENSIONS.filter((ext) => ext !== ref.ext).map(
    (ext) => `${ref.key}${ext}`,
  );
}

/** Collect delete paths for every App Router file being written. */
export function deletePathsForPreferredWrites(
  writes: Array<{ path: string }>,
): string[] {
  const out = new Set<string>();
  const writeSet = new Set(
    writes.map((w) => w.path.replace(/^\.\//, "").replace(/\\/g, "/")),
  );
  for (const w of writes) {
    const preferred = w.path.replace(/^\.\//, "").replace(/\\/g, "/");
    if (!parseAppRouterFile(preferred)) continue;
    for (const sibling of conflictingSiblingPaths(preferred)) {
      if (!writeSet.has(sibling)) out.add(sibling);
    }
  }
  return [...out].sort();
}

export type DuplicateAppRouteIssue = {
  key: string;
  paths: string[];
  message: string;
};

/** Fail when two+ files resolve to the same App Router segment. */
export function findDuplicateAppRouterRoutes(
  paths: string[],
): DuplicateAppRouteIssue[] {
  const byKey = new Map<string, string[]>();
  for (const raw of paths) {
    const ref = parseAppRouterFile(raw);
    if (!ref) continue;
    const list = byKey.get(ref.key) ?? [];
    list.push(ref.path);
    byKey.set(ref.key, list);
  }
  const issues: DuplicateAppRouteIssue[] = [];
  for (const [key, files] of byKey) {
    const unique = [...new Set(files)].sort();
    if (unique.length > 1) {
      issues.push({
        key,
        paths: unique,
        message: `Duplicate App Router files for ${key}: ${unique.join(", ")}`,
      });
    }
  }
  return issues;
}

export function duplicateAppRouterValidationIssues(paths: string[]): string[] {
  return findDuplicateAppRouterRoutes(paths).map((i) => i.message);
}
