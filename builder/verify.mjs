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

const PLACEHOLDER_RE =
  /lorem ipsum|your (headline|company|business|tagline|text) here|\bTODO\b|\bTBD\b|\[insert[^\]]*\]|\[(company|business|name|city|phone|email|address)[^\]]*\]|placeholder text|coming soon…?$/i;

/**
 * @param {{ repoDir: string, devServerUrl: string, log: import("./events.mjs").EventLog, routes?: string[], expectedRoutes?: string[], mode?: "create"|"edit", projectKind?: "site"|"app", timeoutMs?: number }} opts
 * @returns {Promise<{ ok: boolean, issues: string[], routes: string[], report: string }>}
 */
export async function runAcceptance(opts) {
  const issues = [];
  const repoDir = opts.repoDir;
  const discovered = discoverRoutes(repoDir);
  const routes = uniq([...(opts.routes || []), ...discovered]).filter((r) =>
    r.startsWith("/"),
  );
  const isCreate = (opts.mode || "create") === "create";
  const isApp = opts.projectKind === "app";

  // 0. Planned routes that were never built (create only)
  if (isCreate && opts.expectedRoutes?.length) {
    const missing = opts.expectedRoutes.filter(
      (r) => r.startsWith("/") && !/\[/.test(r) && !discovered.includes(r),
    );
    if (missing.length) {
      issues.push(`Planned pages not built yet: ${missing.join(", ")} — add app${missing[0] === "/" ? "" : missing[0]}/page.tsx etc.`);
    }
  }

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

  // 4. Per-page HTML quality: title, description, exactly one h1, no placeholders
  for (const r of results) {
    if (!r.ok || !r.html) continue;
    const html = r.html;
    if (!r.title) issues.push(`${r.path} has no <title> — export metadata.`);
    if (!isApp && !/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html)) {
      issues.push(`${r.path} has no meta description (≥20 chars) — add metadata.description.`);
    }
    const h1s = (html.match(/<h1[\s>]/gi) || []).length;
    if (isCreate && h1s !== 1 && !(isApp && h1s > 1 && r.path !== "/")) {
      issues.push(`${r.path} has ${h1s} <h1> elements — exactly one is required.`);
    }
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    const ph = text.match(PLACEHOLDER_RE);
    if (ph) issues.push(`${r.path} contains placeholder copy: "${ph[0]}" — replace with real content.`);
    if (isCreate && r.path === "/") {
      if (!/<(header|nav|aside)[\s>]/i.test(html)) issues.push("/ has no <header>/<nav> landmark.");
      if (!isApp && !/<footer[\s>]/i.test(html)) issues.push("/ has no <footer> landmark.");
      if (/Drafting your (website|app)/.test(text)) {
        issues.push("/ still shows the boot skeleton placeholder page.");
      }
    }
  }

  // 5a. App scaffolding checklist (apps, create + edit)
  if (isApp) {
    for (const issue of appScaffoldingIssues(repoDir, isCreate)) issues.push(issue);
  }

  // 5. SEO files (website create only)
  if (isCreate && !isApp) {
    if (!existsSync(join(repoDir, "app", "robots.ts")) && !existsSync(join(repoDir, "app", "robots.txt")))
      issues.push("app/robots.ts is missing.");
    if (!existsSync(join(repoDir, "app", "sitemap.ts")) && !existsSync(join(repoDir, "app", "sitemap.xml")))
      issues.push("app/sitemap.ts is missing.");
    if (!existsSync(join(repoDir, "app", "not-found.tsx"))) issues.push("app/not-found.tsx is missing.");
    const root = results.find((r) => r.path === "/");
    if (root?.ok && root.html && !/application\/ld\+json/i.test(root.html)) {
      issues.push("/ has no JSON-LD (<script type=\"application/ld+json\">) — add Organization/LocalBusiness schema in app/layout.tsx.");
    }
  }

  // 6. Source-level placeholder scan (catches non-rendered pages / components)
  const srcHits = scanSourcePlaceholders(repoDir);
  for (const hit of srcHits.slice(0, 5)) issues.push(`Placeholder in source: ${hit}`);

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

/**
 * Deterministic checks for app projects: every env var the code reads is
 * documented, Supabase usage comes with client files + schema, and auth routes
 * come with a session-aware layout. Cheap, source-level, no network.
 * @param {string} repoDir
 * @param {boolean} isCreate
 * @returns {string[]}
 */
function appScaffoldingIssues(repoDir, isCreate) {
  const issues = [];
  const files = listSourceFiles(repoDir, ["app", "lib", "components", "middleware.ts", "proxy.ts"]);
  const read = (rel) => {
    try {
      return readFileSync(join(repoDir, rel), "utf8");
    } catch {
      return "";
    }
  };

  // Env vars referenced anywhere in source.
  const envVars = new Set();
  for (const rel of files) {
    const text = read(rel);
    for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
      const name = m[1];
      if (/^(NODE_ENV|VERCEL(_.*)?|NEXT_RUNTIME|PORT|CI)$/.test(name)) continue;
      envVars.add(name);
    }
  }
  const envExample = read(".env.example");
  if (envVars.size) {
    if (!envExample) {
      issues.push(`.env.example is missing — document ${[...envVars].join(", ")}.`);
    } else {
      const undocumented = [...envVars].filter((v) => !new RegExp(`^\\s*#?\\s*${v}\\s*=`, "m").test(envExample));
      if (undocumented.length) {
        issues.push(`.env.example does not document: ${undocumented.join(", ")}.`);
      }
    }
  }

  // Supabase usage → client helpers + schema + demo fallback.
  let deps = {};
  try {
    const pkg = JSON.parse(read("package.json") || "{}");
    deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    /* reported elsewhere */
  }
  const usesSupabase =
    Boolean(deps["@supabase/supabase-js"] || deps["@supabase/ssr"]) ||
    files.some((rel) => /@supabase\//.test(read(rel)));
  if (usesSupabase) {
    const hasClient = files.some(
      (rel) => /^lib\/supabase\//.test(rel) && /create(Browser|Server)?Client/.test(read(rel)),
    );
    if (!hasClient) {
      issues.push("Supabase is used but lib/supabase/client.ts / server.ts (createClient helpers) are missing.");
    }
    if (!envVars.has("NEXT_PUBLIC_SUPABASE_URL")) {
      issues.push("Supabase is used but nothing reads process.env.NEXT_PUBLIC_SUPABASE_URL — wire the env-based client.");
    }
    const hasSchema =
      existsSync(join(repoDir, "supabase", "schema.sql")) ||
      (existsSync(join(repoDir, "supabase", "migrations")) &&
        readdirSync(join(repoDir, "supabase", "migrations")).some((f) => f.endsWith(".sql")));
    if (isCreate && !hasSchema) {
      issues.push("Supabase is used but supabase/schema.sql (tables + RLS) is missing.");
    }
    const hasFallback = files.some((rel) => /demo-data|seed|fallback/i.test(rel) || /demo data|fallback/i.test(read(rel)));
    if (isCreate && !hasFallback) {
      issues.push("No demo-data fallback found — the preview must render without Supabase env (see lib/demo-data.ts).");
    }
  }

  // Auth routes → session-aware layout / redirect somewhere.
  const authRoutes = files.filter((rel) => /^app\/(\([^)]+\)\/)?(login|signup|sign-in|sign-up|register)\/page\.tsx$/.test(rel));
  if (authRoutes.length) {
    const hasGuard = files.some((rel) => {
      const text = read(rel);
      return /redirect\(/.test(text) && /(getUser|getSession|getClaims|auth\(|session)/i.test(text);
    });
    if (!hasGuard) {
      issues.push(
        `Auth pages exist (${authRoutes.join(", ")}) but no layout/proxy checks the session and redirects signed-out users.`,
      );
    }
  }

  if (isCreate && !existsSync(join(repoDir, "app", "not-found.tsx"))) {
    issues.push("app/not-found.tsx is missing.");
  }
  return issues;
}

/**
 * @param {string} repoDir
 * @param {string[]} tops
 * @returns {string[]} repo-relative paths of .ts/.tsx files
 */
function listSourceFiles(repoDir, tops) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= 2000) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (["node_modules", ".next", ".git", ".cander", "public"].includes(e.name)) continue;
        walk(p);
      } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) {
        out.push(p.slice(repoDir.length + 1));
      }
    }
  };
  for (const top of tops) {
    const abs = join(repoDir, top);
    if (!existsSync(abs)) continue;
    if (/\.(ts|tsx)$/.test(top)) out.push(top);
    else walk(abs);
  }
  return out;
}

function scanSourcePlaceholders(repoDir) {
  const hits = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= 20) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (["node_modules", ".next", ".git", ".cander", "public"].includes(e.name)) continue;
        walk(p);
      } else if (/\.(tsx|jsx|mdx|md)$/.test(e.name)) {
        let text;
        try {
          text = readFileSync(p, "utf8");
        } catch {
          continue;
        }
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (/lorem ipsum|\[insert[^\]]*\]|your (headline|company|business) here/i.test(lines[i])) {
            hits.push(`${p.slice(repoDir.length + 1)}:${i + 1}`);
            break;
          }
        }
      }
    }
  };
  for (const top of ["app", "components"]) {
    if (existsSync(join(repoDir, top))) walk(join(repoDir, top));
  }
  return hits;
}
