// Acceptance checks the builder must pass before `finish` is accepted.
// Phase 1: typecheck + every route renders on the dev server without a Next
// error overlay. Extended in Phase 2 (SEO, placeholder text, screenshots).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execShell, fetchPreview, truncate } from "./tools.mjs";
import { runFunctionalChecks } from "./functional.mjs";

/**
 * Discover static App Router routes from the filesystem.
 * Route groups `(name)` add no segment; dynamic `[slug]` routes are skipped
 * (cannot be fetched without data).
 * @param {string} repoDir
 * @returns {string[]}
 */
export function discoverRoutes(repoDir) {
  return [...discoverRouteFiles(repoDir).keys()].sort();
}

/**
 * URL route → page files serving it (route groups stripped). More than one
 * file for a route is a Next build error.
 * @param {string} repoDir
 * @returns {Map<string, string[]>}
 */
export function discoverRouteFiles(repoDir) {
  const appDir = join(repoDir, "app");
  const routes = new Map();
  if (!existsSync(appDir)) return routes;
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
        const next = /^\(.*\)$/.test(e.name) || e.name.startsWith("@") ? segs : [...segs, e.name];
        walk(join(dir, e.name), next);
      } else if (/^page\.(tsx|jsx|ts|js|mdx)$/.test(e.name)) {
        const route = `/${segs.join("/")}`.replace(/\/+$/, "") || "/";
        const rel = join(dir, e.name).slice(repoDir.length + 1);
        routes.set(route, [...(routes.get(route) || []), rel]);
      }
    }
  };
  walk(appDir, []);
  return routes;
}

const PLACEHOLDER_RE =
  /lorem ipsum|your (headline|company|business|tagline|text) here|\bTODO\b|\bTBD\b|\[insert[^\]]*\]|\[(company|business|name|city|phone|email|address)[^\]]*\]|placeholder text|coming soon…?$/i;

/**
 * @param {{ repoDir: string, devServerUrl: string, log: import("./events.mjs").EventLog, routes?: string[], expectedRoutes?: string[], mode?: "create"|"edit", projectKind?: "site"|"app", siteUrl?: string|null, timeoutMs?: number, features?: string[], scopeRoutes?: string[]|null, functional?: boolean, deadlineMs?: number, writtenPaths?: string[]|null, preview?: import("./preview.mjs").PreviewSupervisor|null, productionBuild?: boolean }} opts
 * @returns {Promise<{ ok: boolean, issues: string[], routes: string[], report: string, classification: "passed"|"app"|"preview_unavailable", preview?: import("./preview.mjs").EnsureResult|null, buildVerified: boolean }>}
 */
export async function runAcceptance(opts) {
  const issues = [];
  const repoDir = opts.repoDir;

  // Phase 0: is the preview server reachable at all? Route verification is
  // meaningless against a dead server — recover it first, and if that is not
  // possible here, report ONE infrastructure problem instead of N route bugs.
  let previewHealth = null;
  if (opts.preview) {
    opts.log.emit("verify", "Checking the preview server…");
    previewHealth = await opts.preview.ensure({ reason: "acceptance" });
    if (!previewHealth.ok) {
      const infra = previewHealth.kind !== "app";
      const line = infra
        ? `Preview server unreachable (${previewHealth.cause}) — infrastructure problem, not a page bug. ${previewHealth.detail || ""}`.trim()
        : `The app fails to start: ${previewHealth.detail || previewHealth.cause}. Fix this compile/runtime error first.`;
      const report = [
        `Preview: down (${previewHealth.cause}, ${previewHealth.attempts} recovery attempt${previewHealth.attempts === 1 ? "" : "s"})`,
        `Issues (1):\n- ${line}`,
      ].join("\n");
      opts.log.emit(
        "verify",
        infra ? "Verification blocked: preview server unavailable" : "Verification found 1 issue (app fails to start)",
        { issues: [line], routes: opts.routes || [], classification: infra ? "preview_unavailable" : "app", cause: previewHealth.cause },
      );
      return {
        ok: false,
        issues: [line],
        routes: opts.routes || [],
        report,
        classification: infra ? "preview_unavailable" : "app",
        preview: previewHealth,
      };
    }
  }
  const routeFiles = discoverRouteFiles(repoDir);
  const discovered = [...routeFiles.keys()].sort();
  const siteOrigin = normalizeOrigin(opts.siteUrl);

  // 0a. Route conflicts + home page location. Two files for one URL is a
  // Next build error; a home page hidden in a route group leaves the boot
  // skeleton app/page.tsx in place (or gets one re-added by publish repair).
  for (const [route, files] of routeFiles) {
    if (files.length > 1) {
      issues.push(`Two pages resolve to ${route}: ${files.join(", ")} — delete one (delete_file).`);
    }
  }
  const rootFiles = routeFiles.get("/") || [];
  if (rootFiles.length === 1 && !/^app\/page\.(tsx|jsx|ts|js|mdx)$/.test(rootFiles[0])) {
    issues.push(`The home page is ${rootFiles[0]} — move it to app/page.tsx (overwrite the skeleton; do not keep both).`);
  }
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

  // 2. Typecheck (only when a tsconfig exists; skip lib check for speed).
  // Edits that only touched styles/content/assets can't change types — skip
  // the whole-repo tsc so a copy tweak doesn't pay for a full typecheck.
  const written = Array.isArray(opts.writtenPaths) ? opts.writtenPaths : null;
  const risk = classifyChangeRisk(written);
  const codeTouched = risk.tier !== "content";
  opts.log.emit("verify", `Change risk: ${risk.tier} — ${risk.reason}`);
  if (!codeTouched) {
    opts.log.emit("verify", "Only styles/content changed — skipping typecheck.");
  } else if (existsSync(join(repoDir, "tsconfig.json"))) {
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

  const tscFailed = issues.some((i) => /^TypeScript errors:|^tsc /.test(i));

  // 3. Every route renders
  opts.log.emit("verify", `Checking ${routes.length} route(s) on the dev server…`);
  const results = [];
  let serverDied = false;
  for (const route of routes.slice(0, 40)) {
    // First hit compiles the route in dev; be patient.
    let r = await fetchPreview(`${opts.devServerUrl}${route}`, 90_000);
    if (!r.ok && r.status === 0) {
      // Connection failure: is the server gone (global) or was this one
      // route slow to compile? Re-probe the root before retrying.
      if (opts.preview) {
        const h = await opts.preview.ensure({ reason: `acceptance:${route}` });
        if (!h.ok) {
          serverDied = true;
          previewHealth = h;
          results.push(r);
          break;
        }
      }
      r = await fetchPreview(`${opts.devServerUrl}${route}`, 90_000);
    }
    results.push(r);
    if (!r.ok) {
      issues.push(
        `${route} → HTTP ${r.status}${r.error ? ` — ${r.error}` : ""}`,
      );
    }
  }
  // The server went away mid-verification (or every route failed to connect):
  // one infrastructure issue, no per-route noise, no OG/HTML checks.
  const allDead = results.length > 0 && results.every((r) => r.status === 0);
  if (serverDied || allDead) {
    const h = previewHealth && !previewHealth.ok ? previewHealth : { cause: "not_running", kind: "infra", detail: "", attempts: 0 };
    const infra = h.kind !== "app";
    const line = infra
      ? `Preview server stopped responding during verification (${h.cause}) — infrastructure problem, not a page bug.${h.detail ? ` ${h.detail}` : ""}`
      : `The app fails to start: ${h.detail || h.cause}. Fix this compile/runtime error first.`;
    const report = [
      `Routes: ${results.map((r) => `${r.path}=${r.status}`).join(" ")}`,
      `Issues (1):\n- ${line}`,
    ].join("\n");
    opts.log.emit("verify", infra ? "Verification blocked: preview server unavailable" : "Verification found 1 issue (app fails to start)", {
      issues: [line],
      routes,
      classification: infra ? "preview_unavailable" : "app",
      cause: h.cause,
    });
    return { ok: false, issues: [line], routes, report, classification: infra ? "preview_unavailable" : "app", preview: h };
  }

  // 4. Per-page HTML quality: title, description, exactly one h1, no placeholders
  for (const r of results) {
    if (!r.ok || !r.html) continue;
    const html = r.html;
    if (isCreate && !r.title) issues.push(`${r.path} has no <title> — export metadata.`);
    if (!isApp && isCreate && !/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html)) {
      issues.push(`${r.path} has no meta description (≥20 chars) — add metadata.description.`);
    }
    // Site-wide SEO contract is enforced when the site is created. Edits are
    // judged on the change itself — otherwise a header tweak turns into an
    // SEO refactor and takes 3 extra rounds.
    if (!isApp && isCreate) {
      const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || "";
      if (!canonical) {
        issues.push(`${r.path} has no canonical link — add metadata.alternates.canonical (with metadataBase in app/layout.tsx).`);
      } else if (siteOrigin && !canonical.startsWith(siteOrigin)) {
        issues.push(`${r.path} canonical is ${canonical} — metadataBase must be ${siteOrigin} (SITE_URL).`);
      }
      const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";
      if (!ogImage) {
        issues.push(`${r.path} has no og:image — add app/opengraph-image.tsx (ImageResponse from "next/og").`);
      } else if (siteOrigin && /^https?:/i.test(ogImage) && !ogImage.startsWith(siteOrigin)) {
        issues.push(`${r.path} og:image points at ${ogImage} — it must be served from ${siteOrigin}.`);
      }
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
    if (siteOrigin && root?.ok && root.html && !root.html.includes(siteOrigin)) {
      issues.push(`/ never references ${siteOrigin} — set metadataBase: new URL("${siteOrigin}") in app/layout.tsx and use it in robots/sitemap/JSON-LD.`);
    }
    const iconFile = ["app/icon.tsx", "app/icon.ts", "app/icon.png", "app/icon.svg", "app/icon.ico", "app/favicon.ico"].find((f) =>
      existsSync(join(repoDir, f)),
    );
    if (!iconFile) {
      issues.push("No favicon: add app/icon.tsx (ImageResponse from \"next/og\") or app/icon.png from the brand asset, plus app/apple-icon.");
    } else if (root?.ok && root.html && !/<link[^>]+rel=["'](?:icon|shortcut icon)["']/i.test(root.html)) {
      issues.push(`/ has no <link rel="icon"> even though ${iconFile} exists — check the file exports (size/contentType) and that it is under app/.`);
    }
    if (root?.ok && root.html && !/<meta[^>]+name=["']twitter:card["']/i.test(root.html)) {
      issues.push("/ has no twitter:card meta — add metadata.twitter (card: \"summary_large_image\", title, description, images).");
    }
    const ogFile = ["app/opengraph-image.tsx", "app/opengraph-image.ts", "app/opengraph-image.png", "app/opengraph-image.jpg"].find((f) =>
      existsSync(join(repoDir, f)),
    );
    if (!ogFile) {
      issues.push("app/opengraph-image.tsx is missing — generate the social image with ImageResponse from \"next/og\".");
    } else if (/\.tsx?$/.test(ogFile) && results.some((r) => r.ok)) {
      // Only judge the OG route when the app itself is serving pages — a
      // connection failure here is the server, not this file.
      const og = await fetchImage(`${opts.devServerUrl}/opengraph-image`, 90_000);
      if (!og.ok && !/^fetch failed/.test(og.detail)) {
        issues.push(`/opengraph-image → ${og.detail} (fix ${ogFile}).`);
      } else if (!og.ok) {
        opts.log.emit("log", `opengraph-image fetch did not connect (${og.detail}); not attributing to ${ogFile}.`);
      }
    }
  }

  // 5b. Stricter SEO bar (website create only): unique titles, alt text,
  // valid JSON-LD, sitemap covers every page, html lang + viewport.
  if (isCreate && !isApp) {
    for (const issue of seoBarIssues(results)) issues.push(issue);
    const sitemapIssue = await sitemapCoverageIssue(opts.devServerUrl, routes, siteOrigin);
    if (sitemapIssue) issues.push(sitemapIssue);
  }

  // 6. Source-level placeholder scan (catches non-rendered pages / components)
  const srcHits = scanSourcePlaceholders(repoDir);
  for (const hit of srcHits.slice(0, 5)) issues.push(`Placeholder in source: ${hit}`);

  // 6b. Static rules for things Vercel's production build rejects but the dev
  // server happily serves (Suspense around useSearchParams, metadata exported
  // from client components, Node APIs in client code, next.config drift…).
  for (const issue of vercelCompatIssues(repoDir, written).slice(0, 12)) issues.push(issue);

  // 6b'. Backend-tier changes (database, auth, server routes) get the security
  // checks in addition to build + browser verification.
  if (risk.tier === "backend") {
    for (const issue of backendSafetyIssues(repoDir, written).slice(0, 8)) issues.push(issue);
    // Real RLS audit against the development database (when Cander tools are available).
    if (opts.tools?.provider) {
      const report = await opts.tools.providerTool("db.rls_check", {});
      if (/ISSUES/.test(report)) {
        for (const line of report.split("\n").filter((l) => l.startsWith("- ")).slice(0, 6)) issues.push(line.slice(2));
      }
      opts.log.emit("verify", report.split("\n")[0].slice(0, 160));
    }
  }

  // 6c. Production build — the authoritative "will Vercel accept this" gate.
  // Only worth paying for once the cheap checks pass (the agent fixes those
  // first); skipped for style/content-only edits. Next 16 keeps dev output in
  // .next/dev, so the running dev server is unaffected.
  let buildVerified = false;
  const wantBuild = opts.productionBuild !== false && codeTouched && !tscFailed;
  if (wantBuild && issues.length === 0) {
    opts.log.emit("verify", "Running a production build (what Vercel will run)…");
    const build = await runProductionBuild(repoDir, opts.timeoutMs);
    if (build.ok) {
      buildVerified = true;
      opts.log.emit("verify", `Production build passed${build.seconds ? ` (${build.seconds}s)` : ""}.`);
    } else if (build.timedOut) {
      // Not attributable to the code with confidence; publish preflight rebuilds.
      opts.log.emit("log", "Production build timed out; publish will rebuild before deploying.");
    } else {
      issues.push(`Production build failed (next build) — Vercel would reject this deploy:\n${build.summary}`);
    }
  }

  // 7. Functional checks in a real browser (console/hydration, overflow at
  // 375/768/1280, mobile nav, links, forms, features). Only worth running once
  // the static checks pass — otherwise the agent gets the cheap fixes first.
  if (opts.functional !== false && !isApp && issues.length === 0 && results.some((r) => r.ok)) {
    opts.log.emit("verify", isCreate ? "Testing the site in a browser (mobile, tablet, desktop)…" : "Checking the change in a browser…");
    try {
      const fx = await runFunctionalChecks({
        devServerUrl: opts.devServerUrl,
        routes: results.filter((r) => r.ok).map((r) => r.path),
        log: opts.log,
        mode: isCreate ? "create" : "edit",
        projectKind: isApp ? "app" : "site",
        features: opts.features || [],
        scopeRoutes: opts.scopeRoutes || null,
        deadlineMs: opts.deadlineMs ? Math.min(opts.deadlineMs - 60_000, Date.now() + 6 * 60_000) : undefined,
      });
      for (const issue of fx.issues.slice(0, 12)) issues.push(issue);
    } catch (err) {
      opts.log.emit("log", `Functional checks crashed: ${String(err?.message || err).slice(0, 200)}`);
    }
  }

  const report = [
    `Routes: ${results.map((r) => `${r.path}=${r.status}`).join(" ")}`,
    issues.length ? `Issues (${issues.length}):\n- ${issues.join("\n- ")}` : "All checks passed.",
  ].join("\n");

  opts.log.emit(
    "verify",
    issues.length ? `Verification found ${issues.length} issue(s)` : "Verification passed",
    { issues: issues.slice(0, 10), routes, classification: issues.length ? "app" : "passed" },
  );
  return {
    ok: issues.length === 0,
    issues,
    routes,
    report,
    classification: issues.length ? "app" : "passed",
    preview: previewHealth,
    buildVerified,
  };
}

function uniq(arr) {
  return [...new Set(arr)];
}

// ── Production build gate ─────────────────────────────────────────────────────

const BUILD_NOISE_RE =
  /^(\s*$|\s+at |[│┌└├─▲○ƒ●◐]|\s*Creating an optimized|\s*Compiled|\s*Collecting|\s*Generating static|\s*Finalizing|\s*Linting|\s*Route \(|\s*First Load|\s*\+ First|\s*[\d.]+ ?k?B|\s*Skipping|npm (warn|notice)|>\s*|\s*Attention: Next\.js)/i;
const BUILD_SIGNAL_RE =
  /error|failed|⨯|✗|cannot|unable|not found|missing|unexpected|invalid|useSearchParams|Suspense|prerender|dynamic server usage|Export encountered|does not (exist|contain)|is not exported|Type error|TS\d{4}|ELIFECYCLE|out of memory|heap/i;

/**
 * `next build` in the repo. Returns a compact, agent-readable summary of why
 * the build failed (error lines + the tail), never the whole log.
 * @param {string} repoDir
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: boolean, timedOut: boolean, summary: string, seconds: number }>}
 */
export async function runProductionBuild(repoDir, timeoutMs) {
  const started = Date.now();
  const res = await execShell(
    "set -o pipefail; npx --no-install next build 2>&1 | tail -n 400",
    { cwd: repoDir, timeoutMs: Math.min(Math.max(timeoutMs ?? 0, 420_000), 900_000) },
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  const failed =
    res.timedOut ||
    res.exitCode !== 0 ||
    /Failed to compile|Build error occurred|Error occurred prerendering|Export encountered (an )?error/i.test(out);
  if (!failed) return { ok: true, timedOut: false, summary: "", seconds };
  const lines = out.split("\n").map((l) => l.replace(/\u001b\[[0-9;]*m/g, "").trimEnd());
  const signal = lines.filter((l) => BUILD_SIGNAL_RE.test(l) && !BUILD_NOISE_RE.test(l));
  const tail = lines.filter((l) => l.trim() && !/^\s+at /.test(l)).slice(-14);
  const picked = uniq([...signal.slice(0, 30), ...tail]).slice(0, 40);
  return {
    ok: false,
    timedOut: Boolean(res.timedOut),
    summary: truncate(picked.join("\n"), 3500) || `next build exited ${res.exitCode}`,
    seconds,
  };
}

// ── Vercel compatibility (static) ─────────────────────────────────────────────

/**
 * Source rules for failures that only show up in `next build` / on Vercel.
 * Each message tells the agent exactly what to change.
 * @param {string} repoDir
 * @param {string[]|null} written repo-relative paths written this run (edit) or null (create = whole repo)
 * @returns {string[]}
 */
/**
 * Risk-tiered verification policy. The tier decides how much verification a
 * change buys before it is accepted:
 *   content → preview only (copy, styles, assets, markdown)
 *   code    → typecheck + Vercel-compat lint + production build + browser
 *   backend → code tier + backend safety checks (RLS, secrets, server-only keys)
 * `written` is null for a create run (whole repo → backend tier when the repo
 * has a backend surface, else code).
 * @param {string[]|null} written
 * @returns {{ tier: "content"|"code"|"backend", reason: string }}
 */
export function classifyChangeRisk(written) {
  if (!written || written.length === 0) return { tier: "backend", reason: "full build — everything is verified" };
  const backend = written.filter(
    (p) =>
      /^supabase\//.test(p) ||
      /^lib\/supabase\//.test(p) ||
      /^app\/api\//.test(p) ||
      /^(middleware|proxy)\.(ts|js)$/.test(p) ||
      /\.sql$/.test(p) ||
      /(^|\/)\.env(\.|$)/.test(p) ||
      /(^|\/)(auth|actions?)\//.test(p),
  );
  if (backend.length) return { tier: "backend", reason: `touches ${backend.slice(0, 3).join(", ")}${backend.length > 3 ? "…" : ""}` };
  const code = written.filter(
    (p) => /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(p) || /(^|\/)(package\.json|tsconfig\.json|next\.config\.[a-z]+)$/.test(p),
  );
  if (code.length) return { tier: "code", reason: `${code.length} code file(s) changed` };
  return { tier: "content", reason: "styles/content/assets only" };
}

/**
 * Backend safety checks for the backend tier. Cheap, static, high-signal:
 *  - service-role key must never be referenced from client code or NEXT_PUBLIC_*
 *  - new tables in SQL must enable row level security
 *  - server-only Supabase client must not be imported from "use client" files
 * @param {string} repoDir
 * @param {string[]|null} written
 * @returns {string[]}
 */
export function backendSafetyIssues(repoDir, written) {
  const issues = [];
  const read = (rel) => {
    try {
      return readFileSync(join(repoDir, rel), "utf8");
    } catch {
      return "";
    }
  };
  const source = listSourceFiles(repoDir, ["app", "components", "lib", "middleware.ts", "proxy.ts"]);
  const files = written && written.length ? source.filter((f) => written.includes(f)) : source;
  for (const rel of files) {
    if (!/\.(tsx|jsx|ts|js)$/.test(rel)) continue;
    const text = read(rel);
    if (!text) continue;
    const client = /^\s*['"]use client['"]/m.test(text.slice(0, 400));
    if (/NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/.test(text)) {
      issues.push(`${rel} exposes a service-role key through NEXT_PUBLIC_* — the service role must stay server-only.`);
    }
    if (client && /SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(text)) {
      issues.push(`${rel} is a client component that references the Supabase service role — use the anon key in the browser and keep privileged access in server code.`);
    }
    if (client && /from\s+['"][^'"]*supabase\/(server|admin)['"]/.test(text)) {
      issues.push(`${rel} ("use client") imports a server-only Supabase client — use the browser client there.`);
    }
    // Hardcoded credentials: anything that looks like a live key in source.
    if (/(sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9_-]{10,}|https:\/\/[a-z]{20}\.supabase\.co)/.test(text)) {
      issues.push(`${rel} contains what looks like a hardcoded key or project URL — read it from process.env instead.`);
    }
  }
  const sqlFiles = (written && written.length ? written : listSqlFiles(repoDir)).filter((p) => /\.sql$/.test(p));
  for (const rel of sqlFiles) {
    const text = read(rel);
    if (!text) continue;
    const created = [...text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)].map((m) => m[1].toLowerCase());
    for (const table of new Set(created)) {
      const rls = new RegExp(`alter\\s+table\\s+(?:public\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`, "i");
      if (!rls.test(text)) {
        issues.push(`${rel} creates table "${table}" without enabling row level security — add "alter table public.${table} enable row level security;" and a policy.`);
      }
    }
  }
  return issues;
}

export function vercelCompatIssues(repoDir, written) {
  const issues = [];
  const all = listSourceFiles(repoDir, ["app", "components", "lib", "middleware.ts", "proxy.ts"]);
  const files = written && written.length ? all.filter((f) => written.includes(f)) : all;
  const read = (rel) => {
    try {
      return readFileSync(join(repoDir, rel), "utf8");
    } catch {
      return "";
    }
  };
  const isClient = (text) => /^\s*['"]use client['"]/m.test(text.slice(0, 400));

  for (const rel of files) {
    if (!/\.(tsx|jsx|ts|js)$/.test(rel)) continue;
    const text = read(rel);
    if (!text) continue;
    const client = isClient(text);
    const isPageOrLayout = /^app\/.*\/?(page|layout|template|default|error|not-found|loading)\.(tsx|jsx)$/.test(rel) || /^app\/(page|layout)\.(tsx|jsx)$/.test(rel);

    if (client && /export\s+(const|async function|function)\s+(metadata|generateMetadata|viewport|generateViewport|generateStaticParams|revalidate|dynamic|runtime)\b/.test(text)) {
      issues.push(`${rel} is a client component ("use client") but exports metadata/route segment config — move metadata to a server layout/page and keep interactive UI in a separate client component.`);
    }
    if (client && /from\s+['"](fs|node:fs|fs\/promises|path|node:path|child_process|os|crypto|node:crypto)['"]/.test(text)) {
      issues.push(`${rel} imports Node-only modules inside a client component — move server logic to a server component, route handler or server action.`);
    }
    if (client && /process\.env\.(?!NEXT_PUBLIC_|NODE_ENV)[A-Z0-9_]+/.test(text)) {
      issues.push(`${rel} reads a non-NEXT_PUBLIC_ env var in a client component — it will be undefined in the browser; read it on the server or rename to NEXT_PUBLIC_*.`);
    }
    if (/useSearchParams\s*\(/.test(text)) {
      // The page file using this component must wrap it in <Suspense>; the
      // component itself is fine. Flag pages that both use the hook and lack
      // Suspense, and client components used by pages without Suspense.
      if (isPageOrLayout && !/<Suspense[\s>]/.test(text)) {
        issues.push(`${rel} calls useSearchParams() without a <Suspense> boundary — Vercel's build fails with "useSearchParams() should be wrapped in a suspense boundary". Move the hook into a small client component rendered inside <Suspense fallback={null}>.`);
      } else if (!isPageOrLayout) {
        const base = rel.replace(/\.(tsx|jsx|ts|js)$/, "");
        const name = base.split("/").pop();
        const importers = all.filter((f) => /^app\/.*page\.(tsx|jsx)$/.test(f)).filter((f) => new RegExp(`from\\s+['"][^'"]*${name}['"]`).test(read(f)));
        for (const p of importers) {
          if (!/<Suspense[\s>]/.test(read(p))) {
            issues.push(`${p} renders ${name} (which calls useSearchParams) without <Suspense> — wrap it: <Suspense fallback={null}><${name} /></Suspense>.`);
          }
        }
      }
    }
    if (/export\s+const\s+runtime\s*=\s*['"]edge['"]/.test(text)) {
      issues.push(`${rel} sets runtime = "edge" — remove it (Node runtime); edge builds reject many packages and fail on Vercel.`);
    }
    for (const issue of clientBoundaryIssues(rel, text, client)) issues.push(issue);
    // `new Date().getFullYear()` in a footer is fine (stable for a year).
    const timeSensitive = text.split("\n").filter((l) => !/getFullYear\(\)/.test(l)).join("\n");
    if (!client && isPageOrLayout && /\b(Math\.random|Date\.now|new Date)\s*\(/.test(timeSensitive) && !/export\s+const\s+dynamic\s*=/.test(text) && !/generateMetadata|headers\(\)|cookies\(\)|searchParams/.test(text)) {
      issues.push(`${rel} uses Date/Math.random during server render — the prerendered HTML will not match the client (hydration mismatch). Compute it in a client component with useEffect or move it to a constant.`);
    }
    if (/from\s+['"]next\/image['"]/.test(text)) {
      for (const m of text.matchAll(/<Image[^>]*\ssrc=\{?["'](https?:\/\/[^"']+)["']/g)) {
        const host = safeHost(m[1]);
        if (host && !nextConfigAllowsHost(repoDir, host)) {
          issues.push(`${rel} renders next/image with a remote src (${host}) not listed in next.config images.remotePatterns — use a plain <img> tag or download_image into public/.`);
          break;
        }
      }
    }
  }

  // next.config drift: the template's config is known-good; agents that edit it
  // (output: "export", experimental flags, distDir) break the Vercel build.
  const cfg = ["next.config.ts", "next.config.mjs", "next.config.js"].map((f) => join(repoDir, f)).find((f) => existsSync(f));
  if (cfg) {
    const text = readFileSync(cfg, "utf8");
    if (/output\s*:\s*['"]export['"]/.test(text)) issues.push(`${cfg.slice(repoDir.length + 1)} sets output: "export" — remove it; the site deploys as a normal Next.js app.`);
    if (/distDir\s*:/.test(text)) issues.push(`${cfg.slice(repoDir.length + 1)} sets distDir — remove it.`);
    if (/ignoreBuildErrors\s*:\s*true|ignoreDuringBuilds\s*:\s*true/.test(text)) issues.push(`${cfg.slice(repoDir.length + 1)} silences build errors (ignoreBuildErrors/ignoreDuringBuilds) — remove that and fix the underlying errors.`);
  }

  // Dynamic routes must have a page that can build without data.
  const dyn = listDynamicRouteFiles(repoDir);
  for (const rel of dyn) {
    const text = read(rel);
    if (/generateStaticParams/.test(text) && /output\s*:\s*['"]export['"]/.test(cfg ? readFileSync(cfg, "utf8") : "")) continue;
    if (/await\s+params\b|params\.then|\bparams\b/.test(text)) continue;
    issues.push(`${rel} is a dynamic route that never reads params — either use params (await params in Next 15+/16) or replace it with static pages.`);
  }
  return issues;
}

/** React / react-dom / next hooks that only run in client components. */
const CLIENT_HOOKS = [
  "useState",
  "useReducer",
  "useEffect",
  "useLayoutEffect",
  "useRef",
  "useCallback",
  "useMemo",
  "useContext",
  "useTransition",
  "useDeferredValue",
  "useOptimistic",
  "useActionState",
  "useSyncExternalStore",
  "useImperativeHandle",
  "useFormStatus",
  "useFormState",
  "usePathname",
  "useRouter",
  "useSearchParams",
  "useParams",
  "useSelectedLayoutSegment",
  "useSelectedLayoutSegments",
];
const CLIENT_HOOK_RE = new RegExp(`\\b(${CLIENT_HOOKS.join("|")})\\s*\\(`, "g");
const HANDLER_RE = /\son(Click|Change|Submit|Input|KeyDown|KeyUp|Focus|Blur|MouseEnter|MouseLeave|Scroll|Toggle)=\{/;

/**
 * A file that uses client-only hooks or event handlers must start with
 * "use client"; hooks must also be imported. Both slip past tsc when the hook
 * comes from an untyped global or the boundary is only enforced at build:
 * `next build` then dies prerendering with "Cannot read properties of null
 * (reading 'useX')" and the preview (dev) still looks fine.
 */
export function clientBoundaryIssues(rel, text, isClientFile) {
  const issues = [];
  if (!/\.(tsx|jsx)$/.test(rel)) return issues;
  if (/^\s*['"]use server['"]/m.test(text.slice(0, 400))) return issues;
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const hooksUsed = new Set();
  for (const m of stripped.matchAll(CLIENT_HOOK_RE)) hooksUsed.add(m[1]);
  const hasHandlers = HANDLER_RE.test(stripped);
  if (!hooksUsed.size && !hasHandlers) return issues;

  if (!isClientFile) {
    const what = [...hooksUsed].slice(0, 3).join(", ") || "event handlers";
    issues.push(
      `${rel} uses ${what} but has no "use client" directive — the production build fails prerendering with "Cannot read properties of null". Add "use client" as the first line (or move the interactive part into a client component).`,
    );
  }
  if (hooksUsed.size) {
    const importBlock = stripped.match(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gm) || [];
    const imported = new Set();
    for (const imp of importBlock) {
      for (const m of imp.matchAll(/\b(use[A-Z]\w*)\b/g)) imported.add(m[1]);
      if (/import\s+\*\s+as\s+React\b|import\s+React\b/.test(imp)) imported.add("__React__");
    }
    const missing = [...hooksUsed].filter((h) => !imported.has(h) && !stripped.includes(`React.${h}(`) && !stripped.includes(`ReactDOM.${h}(`) && !new RegExp(`\\bfunction\\s+${h}\\b|\\bconst\\s+${h}\\s*=`).test(stripped));
    if (missing.length) {
      const src = (h) =>
        h === "useFormStatus" || h === "useFormState"
          ? "react-dom"
          : /^use(Pathname|Router|SearchParams|Params|SelectedLayoutSegments?)$/.test(h)
            ? "next/navigation"
            : "react";
      issues.push(
        `${rel} calls ${missing.join(", ")} without importing it — add ${missing.map((h) => `import { ${h} } from "${src(h)}"`).join("; ")}.`,
      );
    }
  }
  return issues;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function nextConfigAllowsHost(repoDir, host) {
  const cfg = ["next.config.ts", "next.config.mjs", "next.config.js"].map((f) => join(repoDir, f)).find((f) => existsSync(f));
  if (!cfg) return false;
  const text = readFileSync(cfg, "utf8");
  if (text.includes(host)) return true;
  const wild = host.split(".").slice(-2).join(".");
  return new RegExp(`\\*\\*?\\.${wild.replace(/\./g, "\\.")}`).test(text) || /hostname\s*:\s*['"]\*\*['"]/.test(text);
}

function listDynamicRouteFiles(repoDir) {
  const out = [];
  const walk = (dir, inDynamic) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "api" || e.name === "node_modules") continue;
        walk(p, inDynamic || /^\[.*\]$/.test(e.name));
      } else if (inDynamic && /^page\.(tsx|jsx)$/.test(e.name)) {
        out.push(p.slice(repoDir.length + 1));
      }
    }
  };
  walk(join(repoDir, "app"), false);
  return out;
}

// ── SEO bar ───────────────────────────────────────────────────────────────────

/**
 * @param {Array<{ ok: boolean, path: string, html?: string, title?: string }>} results
 * @returns {string[]}
 */
export function seoBarIssues(results) {
  const issues = [];
  const titles = new Map();
  for (const r of results) {
    if (!r.ok || !r.html) continue;
    const html = r.html;
    const title = (r.title || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
    if (title) titles.set(title, [...(titles.get(title) || []), r.path]);
    if (title && title.length > 70) issues.push(`${r.path} <title> is ${title.length} chars — keep it ≤ 60–70 (metadata.title).`);
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
    if (desc && desc.length > 170) issues.push(`${r.path} meta description is ${desc.length} chars — keep it ≤ 160.`);
    if (r.path === "/") {
      if (!/<html[^>]+\blang=["'][a-z]{2}/i.test(html)) issues.push('<html> has no lang attribute — set <html lang="en"> in app/layout.tsx.');
      if (!/<meta[^>]+name=["']viewport["']/i.test(html)) issues.push("/ has no viewport meta — Next adds it automatically unless the layout overrides <head>; remove the custom <head>.");
      for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
          const parsed = JSON.parse(m[1]);
          const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
          if (!nodes.some((n) => n && (n["@type"] || n["@context"]))) issues.push("JSON-LD on / has no @type — use Organization/LocalBusiness/WebSite schema.");
        } catch {
          issues.push("JSON-LD on / is not valid JSON — render it with JSON.stringify(schema) inside <script type=\"application/ld+json\">.");
        }
      }
    }
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
    const noAlt = imgs.filter((tag) => !/\salt=/i.test(tag));
    if (noAlt.length) issues.push(`${r.path} has ${noAlt.length} <img> without alt text — every image needs a descriptive alt (or alt="" if decorative).`);
    if (!/<meta[^>]+property=["']og:title["']/i.test(html)) issues.push(`${r.path} has no og:title — add metadata.openGraph (title, description, url, siteName, images).`);
  }
  for (const [title, paths] of titles) {
    if (paths.length > 1) issues.push(`Pages ${paths.join(", ")} share the same <title> "${title}" — give each page a unique metadata.title.`);
  }
  return issues;
}

/**
 * sitemap.xml must list every public page and robots must allow crawling.
 * @returns {Promise<string|null>}
 */
export async function sitemapCoverageIssue(devServerUrl, routes, siteOrigin) {
  try {
    const res = await fetch(`${devServerUrl}/sitemap.xml`, { signal: AbortSignal.timeout(60_000) });
    if (res.status !== 200) return `/sitemap.xml → HTTP ${res.status} — app/sitemap.ts must export a default function returning MetadataRoute.Sitemap.`;
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const paths = new Set(
      locs.map((u) => {
        try {
          return new URL(u).pathname.replace(/\/+$/, "") || "/";
        } catch {
          return u;
        }
      }),
    );
    const missing = routes.filter((r) => !/\[/.test(r) && !paths.has(r));
    if (missing.length) return `sitemap.xml is missing ${missing.join(", ")} — list every page in app/sitemap.ts.`;
    if (siteOrigin && locs.length && !locs.every((u) => u.startsWith(siteOrigin))) {
      return `sitemap.xml URLs must start with ${siteOrigin} (use SITE_URL in app/sitemap.ts).`;
    }
    const robots = await fetch(`${devServerUrl}/robots.txt`, { signal: AbortSignal.timeout(30_000) });
    if (robots.status === 200) {
      const txt = await robots.text();
      if (/disallow:\s*\/\s*$/im.test(txt)) return "robots.txt disallows the whole site — allow crawling (Disallow: /api/ at most) and reference the sitemap.";
      if (!/sitemap:/i.test(txt)) return "robots.txt has no Sitemap: line — return { rules, sitemap: `${SITE_URL}/sitemap.xml` } from app/robots.ts.";
    }
    return null;
  } catch {
    return null; // network flake — not a page bug
  }
}

/** Generated metadata images return binary; only status + content-type matter. */
async function fetchImage(url, timeoutMs) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const type = res.headers.get("content-type") || "";
    const buf = await res.arrayBuffer();
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
    if (!/^image\//i.test(type)) return { ok: false, detail: `content-type ${type || "unknown"} (expected image/*)` };
    if (buf.byteLength < 1000) return { ok: false, detail: `only ${buf.byteLength} bytes` };
    return { ok: true, detail: `${type}, ${buf.byteLength} bytes` };
  } catch (err) {
    return { ok: false, detail: `fetch failed: ${err?.message || err}` };
  }
}

function normalizeOrigin(url) {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
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
function listSqlFiles(repoDir) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= 200) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.sql$/.test(e.name)) out.push(p.slice(repoDir.length + 1));
    }
  };
  const abs = join(repoDir, "supabase");
  if (existsSync(abs)) walk(abs);
  return out;
}

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
