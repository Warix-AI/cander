/**
 * Preflight validation for normalized 21st components + support files.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import type { NormalizedTwentyFirstComponent } from "@/lib/ai/build/twenty-first/types";
import {
  BLOCKED_PACKAGES,
  BUILTIN_MODULES,
} from "@/lib/ai/build/twenty-first/known-packages";

export type PreflightResult = {
  ok: boolean;
  issues: string[];
};

function packageNameFromSpecifier(spec: string): string {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  return spec.split("/")[0] || spec;
}

const IMPORT_RE =
  /(?:import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s*|export\s+[\s\S]*?\s+from\s*)["']([^"']+)["']/g;

/**
 * Check that every import resolves to a package dep or a scaffold file,
 * and that server/client usage looks coherent.
 */
export function preflightNormalizedComponents(opts: {
  components: NormalizedTwentyFirstComponent[];
  files: ScaffoldFile[];
  packageDependencies: Record<string, string>;
}): PreflightResult {
  const issues: string[] = [];
  const fileSet = new Set(opts.files.map((f) => f.path.replace(/^\.\//, "")));
  const pkg = opts.packageDependencies;

  if (!fileSet.has("tsconfig.json") && opts.components.some((c) =>
    /from\s+["']@\//.test(c.codeSnippet),
  )) {
    issues.push("Missing tsconfig.json with @/* paths");
  }
  if (
    opts.components.some((c) => /from\s+["']@\/lib\/utils["']/.test(c.codeSnippet)) &&
    !fileSet.has("lib/utils.ts")
  ) {
    issues.push("Missing lib/utils.ts for cn() helper");
  }

  for (const c of opts.components) {
    const code = c.codeSnippet;
    let match: RegExpExecArray | null;
    const re = new RegExp(IMPORT_RE.source, "g");
    while ((match = re.exec(code)) !== null) {
      const spec = (match[1] || "").trim();
      if (!spec) continue;

      if (spec.startsWith(".") || spec.startsWith("..")) {
        issues.push(`${c.id}: unresolved relative import ${spec}`);
        continue;
      }

      if (spec.startsWith("@/")) {
        const base = spec.slice(2);
        const candidates = [
          `${base}.tsx`,
          `${base}.ts`,
          `${base}.jsx`,
          `${base}.js`,
          `${base}/index.tsx`,
          `${base}/index.ts`,
        ];
        if (!candidates.some((p) => fileSet.has(p))) {
          issues.push(`${c.id}: missing local module for ${spec}`);
        }
        continue;
      }

      if (BUILTIN_MODULES.has(spec) || BUILTIN_MODULES.has(packageNameFromSpecifier(spec))) {
        continue;
      }

      const name = packageNameFromSpecifier(spec);
      if (BLOCKED_PACKAGES.has(name)) {
        issues.push(`${c.id}: blocked package ${name}`);
        continue;
      }
      if (!pkg[name]) {
        issues.push(`${c.id}: package ${name} not in package.json dependencies`);
      }
    }

    // Server component importing client-only without directive
    const hasHooks =
      /\b(useState|useEffect|useRef|motion\.)\b/.test(code);
    if (hasHooks && !/^\s*["']use client["']/m.test(code)) {
      issues.push(`${c.id}: client hooks/motion without "use client"`);
    }

    // Asset refs
    const assetRe = /(?:src|href)=["'](\/[^"']+\.(?:png|jpe?g|gif|svg|webp|mp4))["']/gi;
    let am: RegExpExecArray | null;
    while ((am = assetRe.exec(code)) !== null) {
      const assetPath = (am[1] || "").replace(/^\//, "public/");
      if (!fileSet.has(assetPath) && !fileSet.has(am[1]!.slice(1))) {
        issues.push(
          `${c.id}: asset ${am[1]} referenced but not present (will 404 unless added later)`,
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
