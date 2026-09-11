// Visual quality review — AI judgment AFTER deterministic technical acceptance.
// Bounded: at most maxAttempts design-repair cycles. Never replaces tsc/build/SEO.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePlaywright } from "./functional.mjs";

/**
 * @typedef {{
 *   ok: boolean,
 *   issues: string[],
 *   report: string,
 *   attempts: number,
 *   skipped?: boolean,
 *   reason?: string,
 * }} VisualQaResult
 */

const SITE_CHECKLIST = `Review this marketing website screenshot/DOM summary for launch quality. Flag ONLY meaningful problems (not nitpicks). Look for:
- weak or generic AI-looking hero (endless cards, purple gradients, badge pill spam, glassmorphism without reason)
- bad spacing / hierarchy / typography inconsistency
- broken mobile layout, overflow, tiny text, low contrast
- mismatched section styles (template collage)
- empty/dead sections, bad image crop/aspect
- weak CTA, nav, or footer
- excessive whitespace or cramped content
Return JSON: {"ok":boolean,"issues":string[]} with at most 6 short issues. ok=true if the page is acceptably polished.`;

const APP_CHECKLIST = `Review this web-app UI for product quality. Flag ONLY meaningful problems. Look for:
- unclear navigation / app shell
- poor information density (too sparse or cramped)
- missing empty/loading/error states where expected
- forms without labels/validation affordances
- tables/dashboards that look unfinished
- broken mobile responsive shell
- inconsistent radius/shadow/color with the rest of the product
Return JSON: {"ok":boolean,"issues":string[]} with at most 6 short issues. ok=true if usable and coherent.`;

/**
 * Capture light DOM summaries (and optional screenshots to disk) for visual review.
 * @returns {Promise<{ routes: Array<{ route: string, width: number, title: string, summary: string, screenshotPath?: string }>, skipped?: string }>}
 */
export async function captureVisualEvidence(opts) {
  const {
    devServerUrl,
    routes,
    log,
    repoDir,
    projectKind = "site",
  } = opts;
  const pw = await ensurePlaywright({ log });
  if (!pw) return { routes: [], skipped: "browser_unavailable" };

  const shotDir = join(repoDir, ".cander", "visual-qa");
  try {
    mkdirSync(shotDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const primary = (routes && routes[0]) || "/";
  const targets = [
    { route: primary, width: 1280 },
    { route: primary, width: 375 },
    ...((routes || []).slice(1, 4).map((r) => ({ route: r, width: 1280 }))),
  ];

  /** @type {Array<{ route: string, width: number, title: string, summary: string, screenshotPath?: string }>} */
  const out = [];
  let browser;
  try {
    browser = await pw.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    for (const t of targets) {
      const page = await browser.newPage({
        viewport: { width: t.width, height: t.width < 500 ? 740 : 900 },
      });
      const url = `${devServerUrl.replace(/\/$/, "")}${t.route.startsWith("/") ? t.route : `/${t.route}`}`;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(800);
        const title = await page.title().catch(() => "");
        const summary = await page
          .evaluate(() => {
            const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
            const h1 = text(document.querySelector("h1"));
            const nav = [...document.querySelectorAll("header a, nav a")]
              .map((a) => text(a))
              .filter(Boolean)
              .slice(0, 12);
            const sections = [...document.querySelectorAll("main section, main > div")]
              .slice(0, 10)
              .map((s) => ({
                tag: s.tagName.toLowerCase(),
                h: text(s.querySelector("h1,h2,h3")),
                h2Count: s.querySelectorAll("h2").length,
                cardish: s.querySelectorAll("[class*='card'],[class*='rounded']").length,
                imgs: s.querySelectorAll("img").length,
              }));
            const overflow = document.documentElement.scrollWidth > window.innerWidth + 4;
            const bodyBg = getComputedStyle(document.body).backgroundColor;
            return JSON.stringify({
              h1,
              nav,
              sections,
              overflowX: overflow,
              bodyBg,
              footer: Boolean(document.querySelector("footer")),
              header: Boolean(document.querySelector("header, nav")),
            });
          })
          .catch(() => "{}");
        const safe = `${t.route.replace(/\W+/g, "_") || "home"}_${t.width}`;
        const shotPath = join(shotDir, `${safe}.png`);
        try {
          await page.screenshot({ path: shotPath, fullPage: false });
        } catch {
          /* optional */
        }
        out.push({
          route: t.route,
          width: t.width,
          title,
          summary,
          screenshotPath: existsSync(shotPath) ? shotPath : undefined,
        });
      } catch (err) {
        out.push({
          route: t.route,
          width: t.width,
          title: "",
          summary: JSON.stringify({ error: String(err?.message || err).slice(0, 200) }),
        });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
  }

  void projectKind;
  return { routes: out };
}

/**
 * Ask the LLM to critique visual evidence. Failures never throw — ok with skipped.
 * @returns {Promise<VisualQaResult>}
 */
export async function runVisualQa(opts) {
  const {
    llm,
    model,
    log,
    projectKind = "site",
    projectName = "",
    designDirection = "",
    evidence,
    maxIssues = 6,
  } = opts;

  if (!evidence?.routes?.length) {
    return {
      ok: true,
      issues: [],
      report: "Visual QA skipped (no evidence).",
      attempts: 0,
      skipped: true,
      reason: evidence?.skipped || "no_evidence",
    };
  }

  log.emit("status", projectKind === "app" ? "Checking the app look…" : "Checking how the site looks…");
  log.emit("progress", "Reviewing layout on desktop and mobile…");

  const checklist = projectKind === "app" ? APP_CHECKLIST : SITE_CHECKLIST;
  const input = [
    `Project: ${projectName || "Untitled"}`,
    designDirection ? `Design direction:\n${designDirection.slice(0, 1500)}` : "",
    checklist,
    "Evidence (DOM summaries per viewport):",
    ...evidence.routes.map(
      (r) => `### ${r.route} @ ${r.width}px — title=${JSON.stringify(r.title)}\n${r.summary}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw = "";
  try {
    raw = await llm.text({
      model,
      instructions:
        "You are a senior product designer reviewing a live preview. Be strict about generic AI aesthetics but fair. Output ONLY compact JSON.",
      input,
      maxOutputTokens: 1200,
    });
  } catch (err) {
    log.emit("log", `Visual QA model failed: ${err?.message || err}`);
    return {
      ok: true,
      issues: [],
      report: "Visual QA skipped (model error).",
      attempts: 0,
      skipped: true,
      reason: "model_failure",
    };
  }

  const parsed = parseVisualJson(raw);
  const issues = (parsed.issues || []).map(String).filter(Boolean).slice(0, maxIssues);
  const ok = parsed.ok === true || (parsed.ok !== false && issues.length === 0);
  const report = ok
    ? "Visual QA passed."
    : `Visual QA found ${issues.length} issue(s):\n${issues.map((i) => `- ${i}`).join("\n")}`;

  log.emit("verify", ok ? "Visual review passed" : `Visual review found ${issues.length} issue(s)`, {
    visual: true,
    issues,
  });

  return { ok, issues, report, attempts: 1 };
}

function parseVisualJson(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: true, issues: [] };
  try {
    const j = JSON.parse(s.slice(start, end + 1));
    return {
      ok: Boolean(j.ok),
      issues: Array.isArray(j.issues) ? j.issues.map(String) : [],
    };
  } catch {
    return { ok: true, issues: [] };
  }
}

/**
 * Persist a small visual report for resume/debug.
 */
export function writeVisualReport(jobDir, result) {
  try {
    writeFileSync(
      join(jobDir, "visual-qa.json"),
      JSON.stringify(
        {
          ok: result.ok,
          issues: result.issues,
          skipped: result.skipped || false,
          reason: result.reason || null,
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } catch {
    /* best-effort */
  }
}
