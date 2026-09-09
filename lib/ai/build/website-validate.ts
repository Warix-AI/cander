/**
 * Deterministic website validation before first draft preview.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import type { SiteSpec } from "@/lib/ai/build/site-spec";

export type WebsiteValidationResult = {
  ok: boolean;
  issues: string[];
};

function fileMap(files: ScaffoldFile[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of files) {
    m.set(f.path.replace(/^\.\//, ""), f.content);
  }
  return m;
}

function hasAny(map: Map<string, string>, candidates: string[]): boolean {
  return candidates.some((p) => map.has(p));
}

function joinContent(map: Map<string, string>): string {
  return [...map.values()].join("\n");
}

/**
 * Validate composed website files against SiteSpec expectations.
 */
export function validateWebsiteFiles(opts: {
  files: ScaffoldFile[];
  spec: SiteSpec;
}): WebsiteValidationResult {
  const issues: string[] = [];
  const map = fileMap(opts.files);
  const blob = joinContent(map);

  for (const page of opts.spec.pages) {
    const path = page.path === "/" ? "app/page.js" : null;
    const altPaths =
      page.path === "/"
        ? ["app/page.js", "app/page.tsx", "app/page.jsx"]
        : [
            `app${page.path}/page.js`,
            `app${page.path}/page.tsx`,
            `app${page.path.replace(/^\//, "")}/page.js`,
          ];
    if (path) {
      if (!hasAny(map, altPaths)) {
        issues.push(`Missing page file for ${page.path || "/"}`);
      }
    } else if (!hasAny(map, altPaths)) {
      // Soft: home-only scaffolds may use hash sections
      if (!blob.includes(page.path) && !blob.includes(`"${page.id}"`)) {
        issues.push(`Declared page “${page.id}” (${page.path}) not found in scaffold`);
      }
    }
  }

  for (const nav of opts.spec.nav) {
    const href = (nav.href || "").trim();
    if (!href) {
      issues.push(`Nav item “${nav.label}” has empty href`);
      continue;
    }
    if (href.startsWith("http") || href.startsWith("mailto:")) continue;
    if (href.startsWith("#")) {
      if (!blob.includes(`id="${href.slice(1)}"`) && !blob.includes(`id='${href.slice(1)}'`)) {
        // anchors may be generated dynamically — warn lightly
        if (!blob.includes(href)) {
          issues.push(`Nav anchor ${href} may not resolve`);
        }
      }
      continue;
    }
    if (!blob.includes(href) && href !== "/") {
      issues.push(`Nav link ${href} (“${nav.label}”) not found in site files`);
    }
  }

  const hasHeader =
    /header|Header|site-header|StickyHeader/i.test(blob) ||
    map.has("components/site-header.js") ||
    map.has("components/Header.js");
  const hasFooter =
    /footer|Footer|site-footer/i.test(blob) ||
    map.has("components/site-footer.js") ||
    map.has("components/Footer.js");
  if (!hasHeader) issues.push("Header markup/component missing");
  if (!hasFooter) issues.push("Footer markup/component missing");

  const hasMobileNav =
    /mobile|Menu|hamburger|md:hidden|lg:hidden|aria-label=["']Menu/i.test(blob);
  if (!hasMobileNav) {
    issues.push("Mobile nav markup not detected");
  }

  const ctaHref = opts.spec.ctaPrimary?.href?.trim();
  if (!ctaHref) {
    issues.push("Primary CTA href is empty");
  } else if (ctaHref === "#" || ctaHref === "") {
    issues.push("Primary CTA href is a stub");
  }

  const hasRobots = hasAny(map, [
    "app/robots.js",
    "app/robots.ts",
    "app/robots.txt",
    "public/robots.txt",
  ]);
  const hasSitemap = hasAny(map, [
    "app/sitemap.js",
    "app/sitemap.ts",
    "public/sitemap.xml",
  ]);
  if (!hasRobots) issues.push("Missing robots (app/robots.js)");
  if (!hasSitemap) issues.push("Missing sitemap (app/sitemap.js)");

  const hasMetadata =
    /export\s+const\s+metadata\b|generateMetadata\b/.test(blob);
  if (!hasMetadata) issues.push("Missing Next.js metadata export");

  // When 21st vendor files are present, require provenance markers / paths.
  const twentyFirstFiles = [...map.keys()].filter((p) =>
    p.startsWith("components/twenty-first/"),
  );
  if (twentyFirstFiles.length > 0) {
    const hasProvenance =
      /\/\*\s*21st(?:\.dev)?[:\s]/i.test(blob) ||
      twentyFirstFiles.some((p) => p.endsWith(".tsx") || p.endsWith(".jsx"));
    if (!hasProvenance) {
      issues.push("21st vendor files present but provenance markers missing");
    }
  }

  if (/\bform\b/i.test(blob) || opts.spec.pages.some((p) =>
    p.sections.some((s) => s.kind === "form"),
  )) {
    const hasAction =
      /action=\{|action="|action='|onSubmit|fetch\(|\/api\/|webhook|formspree|mailto:/i.test(
        blob,
      );
    if (!hasAction) {
      issues.push(
        "Form present without action/trigger (use stub endpoint or documented handler)",
      );
    }
  }

  return { ok: issues.length === 0, issues };
}
