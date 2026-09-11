// Functional acceptance with a headless browser (Playwright/Chromium), run
// inside the sandbox against the dev server. Best-effort: if Chromium cannot
// be installed in this VM the checks are skipped (logged), never fatal.
//
// Create: every route at 375/768/1280 — console/hydration errors, horizontal
// overflow, mobile nav opens, internal links resolve, forms validate, selected
// features exist, favicon/OG present, tokens applied.
// Edit: changed routes only, 375 + 1280, errors/overflow/links.

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execShell } from "./tools.mjs";

const VIEWPORTS = {
  full: [
    { name: "mobile", width: 375, height: 740 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
  ],
  scoped: [
    { name: "mobile", width: 375, height: 740 },
    { name: "desktop", width: 1280, height: 800 },
  ],
};

const CONSOLE_NOISE = /favicon|Download the React DevTools|\[Fast Refresh\]|hot-reloader|webpack-hmr|net::ERR_ABORTED|third-party cookie/i;
const HYDRATION_RE = /hydrat|did not match|Text content does not match|Expected server HTML/i;

let playwrightPromise = null;

/**
 * Install (once per VM) and load Playwright + Chromium. Cached in the
 * builder's own directory so it never touches the customer repo or git.
 * @returns {Promise<import("playwright-core")|null>}
 */
export function ensurePlaywright(opts) {
  if (playwrightPromise) return playwrightPromise;
  playwrightPromise = (async () => {
    const home = process.env.HOME || "/tmp";
    const pwDir = join(home, ".cache", "cander-playwright");
    const browsersPath = join(home, ".cache", "ms-playwright");
    mkdirSync(pwDir, { recursive: true });
    const env = { PLAYWRIGHT_BROWSERS_PATH: browsersPath, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "0" };
    const started = Date.now();
    try {
      if (!existsSync(join(pwDir, "node_modules", "playwright-core"))) {
        opts.log.emit("verify", "Preparing the browser for functional checks…");
        const install = await execShell(
          `cd ${JSON.stringify(pwDir)} && (test -f package.json || npm init -y >/dev/null 2>&1) && npm i --no-audit --no-fund --silent playwright-core@1 @playwright/browser-chromium@1`,
          { cwd: pwDir, timeoutMs: 90_000, env },
        );
        if (install.exitCode !== 0) throw new Error(`npm install failed: ${(install.stderr || install.stdout).slice(-400)}`);
      }
      const require = createRequire(join(pwDir, "package.json"));
      const pw = require("playwright-core");
      // Sanity launch — if system libs are missing, skip (don't sudo-install for minutes).
      let browser;
      try {
        browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
      } catch (err) {
        throw new Error(`Chromium launch failed (skipping functional checks): ${String(err?.message || err).slice(0, 200)}`);
      }
      await browser.close();
      opts.log.emit("verify", `Browser ready (${Math.round((Date.now() - started) / 1000)}s)`);
      process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
      return pw;
    } catch (err) {
      opts.log.emit("log", `Functional checks unavailable in this sandbox: ${String(err?.message || err).slice(0, 300)}`);
      return null;
    }
  })();
  return playwrightPromise;
}

/**
 * @param {{
 *   devServerUrl: string,
 *   routes: string[],
 *   log: import("./events.mjs").EventLog,
 *   mode: "create"|"edit",
 *   projectKind: "site"|"app",
 *   features?: string[],
 *   scopeRoutes?: string[]|null,
 *   deadlineMs?: number,
 * }} opts
 * @returns {Promise<{ ran: boolean, issues: string[] }>}
 */
export async function runFunctionalChecks(opts) {
  const pw = await ensurePlaywright(opts);
  if (!pw) return { ran: false, issues: [] };
  const isCreate = opts.mode === "create";
  const routes = (isCreate ? opts.routes : opts.scopeRoutes?.length ? opts.scopeRoutes : opts.routes)
    .filter((r) => r.startsWith("/") && !/\[/.test(r))
    .slice(0, isCreate ? 20 : 6);
  const viewports = isCreate ? VIEWPORTS.full : VIEWPORTS.scoped;
  const knownRoutes = new Set(opts.routes.map((r) => r.replace(/\/$/, "") || "/"));
  const issues = [];
  const seenIssue = (s) => {
    if (!issues.includes(s)) issues.push(s);
  };
  const deadline = opts.deadlineMs ?? Date.now() + 6 * 60_000;

  const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.width < 600,
        hasTouch: vp.width < 600,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => {
        if (m.type() === "error" && !CONSOLE_NOISE.test(m.text())) consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => consoleErrors.push(`Uncaught: ${e?.message || e}`));

      for (const route of routes) {
        if (Date.now() > deadline) break;
        consoleErrors.length = 0;
        let resp;
        try {
          resp = await page.goto(`${opts.devServerUrl}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
        } catch (err) {
          seenIssue(`${route} did not finish loading in the browser (${vp.name}): ${String(err?.message || err).slice(0, 120)}`);
          continue;
        }
        if (resp && resp.status() >= 400) {
          seenIssue(`${route} → HTTP ${resp.status()} in the browser (${vp.name}).`);
          continue;
        }
        await page.waitForTimeout(400);

        // Console / hydration
        const errs = consoleErrors.filter(Boolean);
        const hydration = errs.filter((e) => HYDRATION_RE.test(e));
        if (hydration.length) {
          seenIssue(`${route}: hydration error — ${hydration[0].slice(0, 220)}`);
        } else if (errs.length) {
          seenIssue(`${route}: console error (${vp.name}) — ${errs[0].slice(0, 220)}`);
        }

        // Horizontal overflow
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const w = Math.max(doc.scrollWidth, document.body?.scrollWidth || 0);
          if (w <= window.innerWidth + 1) return null;
          // Find the widest offending element for a useful hint.
          let worst = null;
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.right > window.innerWidth + 1 && r.width > 40) {
              if (!worst || r.right > worst.right) {
                worst = { right: r.right, tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 60) };
              }
            }
          }
          return { w, worst };
        });
        if (overflow) {
          seenIssue(
            `${route} overflows horizontally at ${vp.width}px (content ${overflow.w}px)${overflow.worst ? ` — widest: <${overflow.worst.tag} class="${overflow.worst.cls}">` : ""}. Add min-w-0 / overflow-x-hidden / responsive widths.`,
          );
        }

        // Internal links resolve (header/main/footer)
        const hrefs = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a[href]"))
            .map((a) => a.getAttribute("href") || "")
            .filter((h) => h.startsWith("/") && !h.startsWith("//")),
        );
        const unique = [...new Set(hrefs.map((h) => h.split(/[?#]/)[0].replace(/\/$/, "") || "/"))];
        for (const h of unique) {
          if (knownRoutes.has(h) || /\.[a-z0-9]{2,5}$/i.test(h) || h.startsWith("/api/")) continue;
          if (isCreate || vp.name === "desktop") {
            try {
              const r = await page.request.get(`${opts.devServerUrl}${h}`, { timeout: 30_000 });
              if (r.status() >= 400) seenIssue(`${route} links to ${h} which returns HTTP ${r.status()} — create the page or fix the href.`);
            } catch {
              seenIssue(`${route} links to ${h} which does not respond.`);
            }
          }
        }
        const emptyHrefs = await page.evaluate(
          () => document.querySelectorAll('a[href="#"], a:not([href]), button:not([type]):not([aria-label]):empty').length,
        );
        if (isCreate && emptyHrefs > 0) seenIssue(`${route} has ${emptyHrefs} link(s) with href="#" or no href — point CTAs at real routes or anchors.`);

        // Mobile nav opens (create, mobile, home)
        if (isCreate && vp.name === "mobile" && route === "/") {
          const navOk = await page.evaluate(async () => {
            const toggles = Array.from(
              document.querySelectorAll('header button, nav button, button[aria-label*="menu" i], button[aria-controls], button[aria-expanded]'),
            ).filter((b) => b instanceof HTMLElement && b.offsetParent !== null);
            if (!toggles.length) {
              // Nav links visible without a toggle is fine (few links).
              const visibleLinks = Array.from(document.querySelectorAll("header a, nav a")).filter(
                (a) => a instanceof HTMLElement && a.offsetParent !== null && a.getBoundingClientRect().width > 0,
              );
              return visibleLinks.length >= 2 ? "visible" : "missing";
            }
            const btn = toggles[0];
            btn.click();
            await new Promise((r) => setTimeout(r, 450));
            const expanded = btn.getAttribute("aria-expanded") === "true";
            const links = Array.from(document.querySelectorAll("a[href]")).filter(
              (a) => a instanceof HTMLElement && a.offsetParent !== null && a.getBoundingClientRect().width > 0 && a.closest("header, nav, [role=dialog], [data-state=open]"),
            );
            return expanded || links.length >= 2 ? "opens" : "stuck";
          });
          if (navOk === "missing") seenIssue("At 375px the header shows no navigation and no menu button — add a working MobileNav (client component).");
          if (navOk === "stuck") seenIssue("At 375px the menu button does not reveal navigation links — wire the MobileNav open state (aria-expanded + visible links).");
        }

        // Forms validate (create): submit empty → expect validation, not navigation to an error
        if (isCreate && vp.name === "desktop") {
          const formResult = await page.evaluate(async () => {
            const form = document.querySelector("form");
            if (!form) return "none";
            const required = form.querySelectorAll("[required]");
            const submit = form.querySelector('button[type=submit], input[type=submit], button:not([type])');
            if (!submit) return "no-submit";
            if (!required.length) return "no-required";
            submit.click();
            await new Promise((r) => setTimeout(r, 300));
            const invalid = form.querySelectorAll(":invalid").length;
            const errorText = /required|invalid|enter|please/i.test(form.textContent || "");
            return invalid > 0 || errorText ? "validates" : "silent";
          });
          if (formResult === "no-submit") seenIssue(`${route}: the form has no submit button.`);
          if (formResult === "no-required") seenIssue(`${route}: the form has no required fields — mark name/email/message as required so validation works.`);
          if (formResult === "silent") seenIssue(`${route}: submitting the empty form gives no validation feedback.`);
        }

        // Home-only checks: favicon/OG tags, tokens, features
        if (isCreate && vp.name === "desktop" && route === "/") {
          const head = await page.evaluate(() => ({
            icon: Boolean(document.querySelector('link[rel~="icon"]')),
            og: Boolean(document.querySelector('meta[property="og:image"]')),
            twitter: Boolean(document.querySelector('meta[name="twitter:card"]')),
            tokens: ["--primary", "--background", "--foreground"].filter(
              (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() !== "",
            ).length,
            h1: document.querySelectorAll("h1").length,
          }));
          if (!head.icon) seenIssue("/ has no <link rel=\"icon\"> — add app/icon.tsx or app/icon.png.");
          if (!head.og) seenIssue("/ has no og:image meta — add app/opengraph-image.tsx.");
          if (!head.twitter) seenIssue("/ has no twitter:card meta — add metadata.twitter.");
          if (head.tokens < 2) seenIssue("Design tokens (--primary/--background/--foreground) are not defined on :root — put them in app/globals.css and use them.");
          for (const issue of await missingFeatureIssues(page, opts.features || [], opts.routes, opts.devServerUrl)) seenIssue(issue);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return { ran: true, issues };
}

/** Check that selected features exist somewhere on the site (home or its own page). */
async function missingFeatureIssues(page, features, routes, base) {
  if (!features.length) return [];
  const norm = features.map((f) => String(f).toLowerCase());
  const want = {
    contact_form: /contact form/,
    testimonials: /testimonial/,
    faq: /faq/,
    booking: /booking|schedul/,
    pricing_table: /pricing/,
    gallery: /gallery/,
    newsletter: /newsletter/,
    map: /map|location/,
    social: /social/,
    blog: /blog|news/,
  };
  const selected = Object.entries(want).filter(([, re]) => norm.some((f) => re.test(f))).map(([k]) => k);
  if (!selected.length) return [];

  // Gather DOM signals from home + the routes most likely to host each feature.
  const probe = async () =>
    page.evaluate(() => {
      const text = (document.body?.innerText || "").toLowerCase();
      const has = (sel) => document.querySelector(sel) !== null;
      return {
        form: has("form"),
        emailInput: has('input[type="email"]'),
        testimonials: /testimonial|what our (clients|customers) say|reviews?/.test(text) || has("blockquote"),
        faq: has("details") || has("[data-state][aria-expanded]") || /faq|frequently asked/.test(text),
        booking: /book|schedule|appointment/.test(text),
        pricing: /pricing|per month|\/mo|\$\d/.test(text),
        gallery: document.querySelectorAll("main img").length >= 4,
        newsletter: /newsletter|subscribe|stay in the loop/.test(text) && has('input[type="email"]'),
        map: has('iframe[src*="map"]') || /find us|our location|directions|hours/.test(text),
        social: has('a[href*="instagram"], a[href*="facebook"], a[href*="linkedin"], a[href*="x.com"], a[href*="twitter"], a[href*="tiktok"], a[href*="youtube"]'),
        blog: /blog|latest (posts|news|articles)/.test(text),
      };
    });
  const merged = await probe();
  const extraRoutes = routes.filter((r) => /contact|pricing|faq|blog|work|gallery|book/i.test(r)).slice(0, 4);
  for (const r of extraRoutes) {
    try {
      await page.goto(`${base}${r}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const p = await probe();
      for (const k of Object.keys(p)) merged[k] = merged[k] || p[k];
    } catch {
      /* ignore */
    }
  }
  const issues = [];
  const fail = (k, msg) => selected.includes(k) && issues.push(msg);
  if (!merged.form) fail("contact_form", "Feature “Contact form” was requested but no <form> exists — add one on /contact (or the home page).");
  if (!merged.testimonials) fail("testimonials", "Feature “Testimonials” was requested but no testimonials section was found.");
  if (!merged.faq) fail("faq", "Feature “FAQ” was requested but no FAQ section/accordion was found.");
  if (!merged.booking) fail("booking", "Feature “Booking / scheduling” was requested but nothing on the site lets a visitor book or schedule.");
  if (!merged.pricing) fail("pricing_table", "Feature “Pricing table” was requested but no pricing content was found.");
  if (!merged.gallery) fail("gallery", "Feature “Photo gallery” was requested but no image gallery (4+ images) was found.");
  if (!merged.newsletter) fail("newsletter", "Feature “Newsletter signup” was requested but no email signup was found.");
  if (!merged.map) fail("map", "Feature “Map & locations” was requested but no location/map section was found.");
  if (!merged.social) fail("social", "Feature “Social links” was requested but no social profile links exist (footer).");
  if (!merged.blog) fail("blog", "Feature “Blog / news” was requested but no blog section or route exists.");
  return issues;
}

/**
 * Agent-facing page inspection: load one route in a real browser and return
 * console/uncaught errors, horizontal overflow, and an accessibility outline
 * (landmarks, headings, unlabeled controls). Used by the coder to debug what
 * the HTML fetch in check_preview cannot show.
 * @param {{ devServerUrl: string, route: string, width?: number, log: import("./events.mjs").EventLog }} opts
 */
export async function inspectPage(opts) {
  const pw = await ensurePlaywright({ log: opts.log });
  if (!pw) return "Browser inspection is unavailable in this sandbox; use check_preview.";
  const width = Number(opts.width) >= 320 ? Number(opts.width) : 1280;
  const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !CONSOLE_NOISE.test(m.text())) errors.push(m.text().slice(0, 240));
    });
    page.on("pageerror", (e) => errors.push(`Uncaught: ${String(e?.message || e).slice(0, 240)}`));
    const route = String(opts.route || "/").startsWith("/") ? String(opts.route || "/") : `/${opts.route}`;
    let status = 0;
    try {
      const resp = await page.goto(`${opts.devServerUrl}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
      status = resp ? resp.status() : 0;
    } catch (err) {
      return `${route} did not finish loading: ${String(err?.message || err).slice(0, 200)}`;
    }
    await page.waitForTimeout(400);
    const summary = await page.evaluate(() => {
      const doc = document;
      const overflow = doc.documentElement.scrollWidth - doc.documentElement.clientWidth;
      const landmarks = [...doc.querySelectorAll("header,nav,main,footer,aside,[role]")].map((el) => el.getAttribute("role") || el.tagName.toLowerCase());
      const headings = [...doc.querySelectorAll("h1,h2,h3")].slice(0, 30).map((h) => `${h.tagName.toLowerCase()} ${(h.textContent || "").trim().slice(0, 60)}`);
      const unlabeled = [...doc.querySelectorAll("input,select,textarea,button")]
        .filter((el) => {
          if (el.tagName === "BUTTON") return !(el.textContent || "").trim() && !el.getAttribute("aria-label");
          const id = el.getAttribute("id");
          return !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !(id && doc.querySelector(`label[for="${id}"]`)) && !el.closest("label") && el.getAttribute("type") !== "hidden";
        })
        .slice(0, 10)
        .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : ""}`);
      const imgsNoAlt = [...doc.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
      const title = doc.title;
      const overlay = doc.querySelector("nextjs-portal") ? "Next.js error overlay is showing" : null;
      return { overflow, landmarks, headings, unlabeled, imgsNoAlt, title, overlay };
    });
    const lines = [
      `${route} @ ${width}px → HTTP ${status}${summary.title ? ` · title "${summary.title.slice(0, 80)}"` : ""}`,
      summary.overlay ? `!! ${summary.overlay}` : null,
      errors.length ? `Console/runtime errors (${errors.length}):\n- ${[...new Set(errors)].slice(0, 6).join("\n- ")}` : "No console errors.",
      summary.overflow > 2 ? `Horizontal overflow: ${summary.overflow}px wider than the viewport.` : "No horizontal overflow.",
      `Landmarks: ${summary.landmarks.length ? [...new Set(summary.landmarks)].join(", ") : "(none)"}`,
      `Headings: ${summary.headings.length ? summary.headings.join(" | ") : "(none)"}`,
      summary.unlabeled.length ? `Unlabeled controls: ${summary.unlabeled.join(", ")}` : "All form controls labelled.",
      summary.imgsNoAlt ? `${summary.imgsNoAlt} image(s) missing alt.` : null,
    ].filter(Boolean);
    return lines.join("\n").slice(0, 6000);
  } finally {
    await browser.close().catch(() => {});
  }
}
