/**
 * Pure publish-preflight checks (no GitHub/sandbox I/O).
 * Used by preflight.ts and unit tests.
 */

import { packageJsonHasNext } from "@/lib/ai/build/site-package";
import {
  duplicateAppRouterValidationIssues,
  hasRootPage,
} from "@/lib/ai/build/routes/app-router-conflicts";
import { seoConsistencyIssues } from "@/lib/ai/build/seo-consistency";

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
const SKIP_PATH =
  /(^|\/)(node_modules|\.next|\.git|dist|coverage|public\/)(\/|$)/;

/** Node / Next builtins and aliases that are not package.json deps. */
const BUILTIN_OR_ALIAS = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "next",
  "next/link",
  "next/image",
  "next/navigation",
  "next/headers",
  "next/font",
  "next/font/google",
  "next/font/local",
  "next/server",
  "next/dynamic",
  "next/script",
  "next/og",
  "fs",
  "path",
  "url",
  "crypto",
  "stream",
  "util",
  "os",
  "http",
  "https",
  "buffer",
  "events",
  "child_process",
  "module",
  "assert",
  "zlib",
  "querystring",
  "string_decoder",
  "tty",
  "net",
  "dns",
  "tls",
  "worker_threads",
]);

function parsePackageName(spec: string): string | null {
  const s = spec.trim();
  if (!s || s.startsWith(".") || s.startsWith("/") || s.startsWith("@/")) {
    return null;
  }
  if (s.startsWith("@")) {
    const parts = s.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return s.split("/")[0] || null;
}

function packageJsonDepNames(pkgRaw: string): Set<string> {
  try {
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const names = new Set<string>();
    for (const key of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ] as const) {
      const block = pkg[key];
      if (block && typeof block === "object") {
        for (const n of Object.keys(block as Record<string, unknown>)) {
          names.add(n);
        }
      }
    }
    return names;
  } catch {
    return new Set();
  }
}

export function isPreflightSourcePath(path: string): boolean {
  return SOURCE_EXT.test(path) && !SKIP_PATH.test(path);
}

/**
 * Extract bare package imports from source and report missing package.json deps.
 * Relative and `@/` imports are ignored here (`@/` checked separately).
 */
export function collectMissingPackageDeps(
  sources: Array<{ path: string; content: string }>,
  packageJsonRaw: string,
): string[] {
  const deps = packageJsonDepNames(packageJsonRaw);
  const missing = new Set<string>();
  const importRe =
    /(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;

  for (const file of sources) {
    if (!isPreflightSourcePath(file.path)) continue;
    let m: RegExpExecArray | null;
    const content = file.content;
    importRe.lastIndex = 0;
    while ((m = importRe.exec(content))) {
      const spec = m[1];
      if (!spec || spec.startsWith(".") || spec.startsWith("@/")) continue;
      if (BUILTIN_OR_ALIAS.has(spec)) continue;
      if (spec.startsWith("next/")) {
        if (!deps.has("next")) missing.add("next");
        continue;
      }
      if (spec.startsWith("react/") || spec === "react-dom/client") {
        if (spec.startsWith("react/") && !deps.has("react")) missing.add("react");
        if (spec.startsWith("react-dom") && !deps.has("react-dom")) {
          missing.add("react-dom");
        }
        continue;
      }
      const name = parsePackageName(spec);
      if (!name) continue;
      if (BUILTIN_OR_ALIAS.has(name)) continue;
      if (!deps.has(name)) missing.add(name);
    }
  }

  return [...missing]
    .sort()
    .map(
      (n) =>
        `Missing dependency "${n}" (imported in tip, not in package.json).`,
    );
}

/** Resolve whether an `@/…` import has a matching tip path. */
export function collectMissingAliasPaths(
  sources: Array<{ path: string; content: string }>,
  tipPaths: string[],
): string[] {
  const pathSet = new Set(tipPaths);
  const issues: string[] = [];
  const seen = new Set<string>();
  const importRe =
    /(?:from\s+|import\s*\(|require\s*\()\s*['"](@\/[^'"]+)['"]/g;
  const exts = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    "/index.ts",
    "/index.tsx",
    "/index.js",
  ];

  for (const file of sources) {
    if (!isPreflightSourcePath(file.path)) continue;
    let m: RegExpExecArray | null;
    importRe.lastIndex = 0;
    while ((m = importRe.exec(file.content))) {
      const spec = m[1];
      if (!spec || seen.has(spec)) continue;
      seen.add(spec);
      const rel = spec.slice(2);
      const ok = exts.some((ext) => pathSet.has(rel + ext));
      if (!ok) {
        issues.push(
          `Unresolved import "${spec}" from ${file.path} (no matching tip file).`,
        );
      }
    }
  }
  return issues;
}

export function seoTipIssues(
  paths: string[],
  layoutContent: string | null,
  robotsContent: string | null,
): string[] {
  return seoConsistencyIssues({
    paths,
    layoutContent,
    robotsContent,
    requireBoth: false,
  });
}

export function staticTipStructureIssues(
  paths: string[],
  packageJsonRaw: string | null,
): string[] {
  const issues: string[] = [];
  if (!paths.includes("package.json")) {
    issues.push("package.json missing on draft tip.");
  } else if (!packageJsonRaw || !packageJsonHasNext(packageJsonRaw)) {
    issues.push('package.json must list "next", "react", and "react-dom".');
  }

  // Route-group aware: app/(marketing)/page.tsx is a valid root page.
  const hasPage = hasRootPage(paths);
  const hasLayout =
    paths.includes("app/layout.tsx") ||
    paths.includes("app/layout.ts") ||
    paths.includes("app/layout.jsx") ||
    paths.includes("app/layout.js");
  if (!hasPage) issues.push("Missing App Router page (app/page.tsx).");
  if (!hasLayout) issues.push("Missing App Router layout (app/layout.tsx).");
  issues.push(...duplicateAppRouterValidationIssues(paths));
  return issues;
}
