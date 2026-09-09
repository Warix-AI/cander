/**
 * Tip / manifest validation for plan-first builds.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import type {
  BuildPlanJson,
  ImplementationManifest,
  ImplementationValidation,
} from "@/lib/ai/build/plan/types";
import { packageJsonHasNext } from "@/lib/ai/build/site-package";
import {
  validateWebsiteFiles,
  type WebsiteValidationResult,
} from "@/lib/ai/build/website-validate";
import type { SiteSpec } from "@/lib/ai/build/site-spec";
import { duplicateAppRouterValidationIssues } from "@/lib/ai/build/routes/app-router-conflicts";

export function validateNavRoutesAgainstFiles(
  plan: BuildPlanJson,
  files: ScaffoldFile[],
): string[] {
  const paths = new Set(
    files.map((f) => f.path.replace(/^\.\//, "")),
  );
  const issues: string[] = [];
  for (const item of plan.nav) {
    const href = item.href.trim();
    if (!href || href.startsWith("#") || href.startsWith("http")) continue;
    const candidates =
      href === "/"
        ? ["app/page.tsx", "app/page.ts", "app/page.jsx", "app/page.js"]
        : [
            `app${href}/page.tsx`,
            `app${href}/page.ts`,
            `app${href}/page.jsx`,
            `app${href}/page.js`,
            `app${href.replace(/^\//, "")}/page.tsx`,
            `app${href.replace(/^\//, "")}/page.js`,
          ];
    if (!candidates.some((p) => paths.has(p))) {
      issues.push(`Nav href ${href} has no App Router page file`);
    }
  }
  return issues;
}

export function validatePlanFirstTip(opts: {
  files: ScaffoldFile[];
  spec: SiteSpec;
  plan?: BuildPlanJson | null;
}): WebsiteValidationResult & { visual: string[] } {
  const base = validateWebsiteFiles({
    files: opts.files,
    spec: opts.spec,
  });
  const issues = [
    ...base.issues,
    ...duplicateAppRouterValidationIssues(opts.files.map((f) => f.path)),
  ];
  const pkg = opts.files.find((f) => f.path === "package.json");
  if (!pkg || !packageJsonHasNext(pkg.content)) {
    issues.push("package.json missing next dependency");
  }
  if (opts.plan) {
    issues.push(...validateNavRoutesAgainstFiles(opts.plan, opts.files));
  }
  return {
    ok: issues.length === 0,
    issues,
    visual: [],
  };
}

/** Placeholder visual QA checklist (desktop/tablet/mobile) — Phase 4. */
export function visualQaChecklist(): string[] {
  return [
    "desktop: hero readable, primary CTA visible",
    "tablet: nav collapses or wraps without overflow",
    "mobile: no horizontal scroll; CTA tappable",
  ];
}

export function mergeValidationIntoManifest(
  manifest: ImplementationManifest | null | undefined,
  technical: string[],
  visual: string[],
): ImplementationManifest {
  const validation: ImplementationValidation = {
    ok: technical.length === 0 && visual.length === 0,
    technical,
    visual,
    repairedAt: undefined,
  };
  return {
    version: 1,
    files: manifest?.files ?? [],
    packageJson: manifest?.packageJson,
    routes: manifest?.routes ?? [],
    tasks: manifest?.tasks ?? [],
    validation,
    updatedAt: new Date().toISOString(),
  };
}
