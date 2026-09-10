/**
 * Deterministic website validation before first draft preview.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import type { SiteSpec } from "@/lib/ai/build/site-spec";
import { packageJsonHasNext } from "@/lib/ai/build/site-package";
import { duplicateAppRouterValidationIssues } from "@/lib/ai/build/routes/app-router-conflicts";
import { seoConsistencyIssues } from "@/lib/ai/build/seo-consistency";

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
    const altPaths =
      page.path === "/"
        ? ["app/page.tsx", "app/page.ts", "app/page.jsx", "app/page.js"]
        : [
            `app${page.path}/page.tsx`,
            `app${page.path}/page.ts`,
            `app${page.path}/page.jsx`,
            `app${page.path}/page.js`,
            `app${page.path.replace(/^\//, "")}/page.tsx`,
            `app${page.path.replace(/^\//, "")}/page.js`,
          ];
    if (page.path === "/" || page.path === "") {
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
    if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    // Same-page anchors: #section or /#section
    const hashIdx = href.indexOf("#");
    if (hashIdx >= 0) {
      const id = href.slice(hashIdx + 1).trim();
      const pathOnly = href.slice(0, hashIdx) || "/";
      if (id) {
        if (
          !blob.includes(`id="${id}"`) &&
          !blob.includes(`id='${id}'`) &&
          !blob.includes(`#${id}`)
        ) {
          // Soft: anchors may be added during compose — only flag if path isn't home-only
          if (pathOnly !== "/" && pathOnly !== "") {
            issues.push(`Nav anchor ${href} may not resolve`);
          }
        }
      }
      continue;
    }
    if (href.startsWith("#")) {
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
    "app/robots.ts",
    "app/robots.js",
    "app/robots.txt",
    "public/robots.txt",
  ]);
  const hasSitemap = hasAny(map, [
    "app/sitemap.ts",
    "app/sitemap.js",
    "public/sitemap.xml",
  ]);
  if (!hasRobots) issues.push("Missing robots (app/robots.ts)");
  if (!hasSitemap) issues.push("Missing sitemap (app/sitemap.ts)");

  const robotsPath = [
    "app/robots.ts",
    "app/robots.js",
    "app/robots.txt",
    "public/robots.txt",
  ].find((p) => map.has(p));
  const layoutPath = ["app/layout.tsx", "app/layout.ts", "app/layout.jsx", "app/layout.js"].find(
    (p) => map.has(p),
  );
  issues.push(
    ...seoConsistencyIssues({
      paths: [...map.keys()],
      robotsContent: robotsPath ? map.get(robotsPath) ?? null : null,
      layoutContent: layoutPath ? map.get(layoutPath) ?? null : null,
      requireBoth: false, // presence already checked above
    }),
  );

  const hasMetadata =
    /export\s+const\s+metadata\b|generateMetadata\b/.test(blob);
  if (!hasMetadata) issues.push("Missing Next.js metadata export");

  const pkgRaw =
    map.get("package.json") ||
    map.get("./package.json") ||
    "";
  if (!packageJsonHasNext(pkgRaw)) {
    issues.push(
      'package.json must list "next", "react", and "react-dom" in dependencies (Vercel cannot detect Next.js otherwise)',
    );
  }

  // When 21st vendor files are present, require support files and resolvable deps.
  const twentyFirstFiles = [...map.keys()].filter(
    (p) =>
      p.startsWith("components/twenty-first/") &&
      /\.(tsx|ts|jsx|js)$/.test(p) &&
      !p.endsWith("README.md"),
  );
  if (twentyFirstFiles.length > 0) {
    const hasProvenance =
      /\/\*\s*21st(?:\.dev)?[:\s]/i.test(blob) ||
      twentyFirstFiles.length > 0;
    if (!hasProvenance) {
      issues.push("21st vendor files present but provenance markers missing");
    }
    if (!map.has("lib/utils.ts") && /@\/lib\/utils/.test(blob)) {
      issues.push("21st components import @/lib/utils but lib/utils.ts is missing");
    }
    if (!map.has("tsconfig.json") && /@\//.test(blob)) {
      issues.push("21st components use @/ imports but tsconfig.json is missing");
    }
    let pkgDeps: Record<string, string> = {};
    try {
      const parsed = JSON.parse(pkgRaw || "{}") as {
        dependencies?: Record<string, string>;
      };
      pkgDeps = parsed.dependencies ?? {};
    } catch {
      /* ignore */
    }
    for (const path of twentyFirstFiles) {
      const src = map.get(path) || "";
      if (/from\s+["']ai["']/.test(src)) {
        issues.push(`${path} still imports blocked package "ai"`);
      }
      if (/^\s*\/\/\s*@ts-nocheck/m.test(src)) {
        issues.push(`${path} uses @ts-nocheck — normalize instead of suppressing errors`);
      }
      const importRe =
        /from\s+["'](framer-motion|lucide-react|clsx|tailwind-merge|class-variance-authority)["']/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(src)) !== null) {
        const name = m[1]!;
        if (!pkgDeps[name]) {
          issues.push(`${path} imports ${name} but package.json lacks it`);
        }
      }
      const uiRe = /from\s+["']@\/components\/ui\/([^"']+)["']/g;
      while ((m = uiRe.exec(src)) !== null) {
        const ui = m[1]!;
        const candidates = [
          `components/ui/${ui}.tsx`,
          `components/ui/${ui}.ts`,
          `components/ui/${ui}.jsx`,
          `components/ui/${ui}.js`,
        ];
        if (!candidates.some((c) => map.has(c))) {
          issues.push(`${path} imports @/components/ui/${ui} but file is missing`);
        }
      }
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

  issues.push(
    ...duplicateAppRouterValidationIssues([...map.keys()]),
  );

  return { ok: issues.length === 0, issues };
}
