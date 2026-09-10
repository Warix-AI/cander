// Acceptance checks the builder must pass before `finish` is accepted.
// Phase 1: typecheck + every route renders on the dev server without a Next
// error overlay. Extended in Phase 2 (SEO, placeholder text, screenshots).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execShell, fetchPreview, truncate } from "./tools.mjs";

/**
 * Discover static App Router routes from the filesystem.
 * Route groups `(name)` add no segment; dynamic `[slug]` routes are skipped
 * (cannot be fetched without data).
 * @param {string} repoDir
 * @returns {string[]}
 */
export function discoverRoutes(repoDir) {
  const appDir = join(repoDir, "app");
  if (!existsSync(appDir)) return ["/"];
  const routes = new Set();
  const walk = (dir, segs) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.startsWith("_") || e.name === "api") continue;
        if (/^\[.*\]$/.test(e.name)) continue;
        const next = /^\(.*\)$/.test(e.name) ? segs : [...segs, e.name];
        walk(join(dir, e.name), next);
      } else if (/^page\.(tsx|jsx|ts|js|mdx)$/.test(e.name)) {
        routes.add(`/${segs.join("/")}`.replace(/\/+$/, "") || "/");
      }
    }
  };
  walk(appDir, []);
  return [...routes].sort();
}

/**
 * @param {{ repoDir: string, devServerUrl: string, log: import("./events.mjs").EventLog, routes?: string[], timeoutMs?: number }} opts
 * @returns {Promise<{ ok: boolean, issues: string[], routes: string[], report: string }>}
 */
export async function runAcceptance(opts) {
  const issues = [];
  const repoDir = opts.repoDir;
  const routes = uniq([...(opts.routes || []), ...discoverRoutes(repoDir)]).filter(
    (r) => r.startsWith("/"),
  );

  // 1. package.json sanity
  const pkgPath = join(repoDir, "package.json");
  if (!existsSync(pkgPath)) {
    issues.push("package.json is missing.");
  } else {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const deps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
      if (!deps.next) issues.push("package.json has no `next` dependency.");
      if (!deps.react || !deps["react-dom"]) issues.push("package.json is missing react/react-dom.");
    } catch {
      issues.push("package.json is not valid JSON.");
    }
  }

  // 2. Typecheck (only when a tsconfig exists; skip lib check for speed)
  if (existsSync(join(repoDir, "tsconfig.json"))) {
    opts.log.emit("verify", "Typechecking (tsc --noEmit)…");
    const tsc = await execShell("npx --no-install tsc --noEmit --pretty false --skipLibCheck", {
      cwd: repoDir,
      timeoutMs: Math.min(opts.timeoutMs ?? 240_000, 600_000),
    });
    if (tsc.exitCode !== 0) {
      const lines = `${tsc.stdout}\n${tsc.stderr}`
        .split("\n")
        .filter((l) => /error TS\d+/.test(l))
        .slice(0, 25);
      if (lines.length) {
        issues.push(`TypeScript errors:\n${lines.join("\n")}`);
      } else if (tsc.timedOut) {
        issues.push("tsc timed out.");
      } else if (!/Cannot find module 'typescript'|not found/i.test(tsc.stderr)) {
        issues.push(`tsc exited ${tsc.exitCode}:\n${truncate(tsc.stderr || tsc.stdout, 1500)}`);
      }
    }
  }

  // 3. Every route renders
  opts.log.emit("verify", `Checking ${routes.length} route(s) on the dev server…`);
  const results = [];
  for (const route of routes.slice(0, 40)) {
    // First hit compiles the route in dev; be patient.
    let r = await fetchPreview(`${opts.devServerUrl}${route}`, 90_000);
    if (!r.ok && r.status === 0) {
      r = await fetchPreview(`${opts.devServerUrl}${route}`, 90_000);
    }
    results.push(r);
    if (!r.ok) {
      issues.push(
        `${route} → HTTP ${r.status}${r.error ? ` — ${r.error}` : ""}`,
      );
    }
  }

  // 4. Root essentials
  const rootHtml = results.find((r) => r.path === "/");
  if (rootHtml && rootHtml.ok && !rootHtml.title) {
    issues.push("/ has no <title> — add metadata to app/layout.tsx or app/page.tsx.");
  }

  const report = [
    `Routes: ${results.map((r) => `${r.path}=${r.status}`).join(" ")}`,
    issues.length ? `Issues (${issues.length}):\n- ${issues.join("\n- ")}` : "All checks passed.",
  ].join("\n");

  opts.log.emit(
    "verify",
    issues.length ? `Verification found ${issues.length} issue(s)` : "Verification passed",
    { issues: issues.slice(0, 10), routes },
  );
  return { ok: issues.length === 0, issues, routes, report };
}

function uniq(arr) {
  return [...new Set(arr)];
}
