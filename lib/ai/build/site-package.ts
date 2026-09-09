/**
 * Canonical package.json for generated Cander sites (Next App Router).
 * Keep this in sync with compose-site / recipes — Vercel fails publish when
 * "next" is missing from dependencies.
 */

import { SITE_COMMON_DEPENDENCIES } from "@/lib/ai/build/site-support-files";

export const SITE_NEXT_VERSION = "16.3.1";
export const SITE_REACT_VERSION = "19.1.0";

export function canonicalSitePackageJson(opts?: {
  name?: string;
}): Record<string, unknown> {
  return {
    name: opts?.name?.trim() || "cander-site",
    private: true,
    scripts: {
      dev: "next dev --hostname 0.0.0.0 --port 3000",
      build: "next build",
      start: "next start -p 3000",
      "vercel-build": "next build",
    },
    dependencies: {
      next: SITE_NEXT_VERSION,
      react: SITE_REACT_VERSION,
      "react-dom": SITE_REACT_VERSION,
      ...SITE_COMMON_DEPENDENCIES,
    },
  };
}

export function canonicalSitePackageJsonText(opts?: { name?: string }): string {
  return `${JSON.stringify(canonicalSitePackageJson(opts), null, 2)}\n`;
}

/** True when package.json lists next (and react) for Vercel/Next detection. */
export function packageJsonHasNext(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  try {
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = {
      ...(pkg.devDependencies ?? {}),
      ...(pkg.dependencies ?? {}),
    };
    return Boolean(deps.next && deps.react && deps["react-dom"]);
  } catch {
    return false;
  }
}

/**
 * Merge existing package.json with required Next deps/scripts without wiping
 * extra dependencies Codex or 21st may have added.
 */
export function ensureNextInPackageJson(
  raw: string | null | undefined,
  opts?: { name?: string },
): string {
  const base = canonicalSitePackageJson(opts);
  if (!raw?.trim()) {
    return `${JSON.stringify(base, null, 2)}\n`;
  }
  try {
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const existingDeps =
      (pkg.dependencies as Record<string, string> | undefined) ?? {};
    const dependencies: Record<string, string> = {
      ...SITE_COMMON_DEPENDENCIES,
      ...existingDeps,
      next: existingDeps.next || SITE_NEXT_VERSION,
      react: existingDeps.react || SITE_REACT_VERSION,
      "react-dom": existingDeps["react-dom"] || SITE_REACT_VERSION,
    };
    for (const [key, version] of Object.entries(SITE_COMMON_DEPENDENCIES)) {
      if (!dependencies[key]) dependencies[key] = version;
    }
    // Prefer dependencies over devDependencies for Next (Vercel detection).
    const devDependencies = {
      ...((pkg.devDependencies as Record<string, string> | undefined) ?? {}),
    };
    delete devDependencies.next;
    delete devDependencies.react;
    delete devDependencies["react-dom"];
    const scripts = {
      ...((pkg.scripts as Record<string, string> | undefined) ?? {}),
      dev:
        ((pkg.scripts as Record<string, string> | undefined)?.dev as
          | string
          | undefined) || (base.scripts as Record<string, string>).dev,
      build:
        ((pkg.scripts as Record<string, string> | undefined)?.build as
          | string
          | undefined) || (base.scripts as Record<string, string>).build,
      start:
        ((pkg.scripts as Record<string, string> | undefined)?.start as
          | string
          | undefined) || (base.scripts as Record<string, string>).start,
      "vercel-build":
        ((pkg.scripts as Record<string, string> | undefined)?.["vercel-build"] as
          | string
          | undefined) || "next build",
    };
    const nextPkg = {
      ...pkg,
      name:
        (typeof pkg.name === "string" && pkg.name.trim()) ||
        (base.name as string),
      private: true,
      scripts,
      dependencies,
      ...(Object.keys(devDependencies).length
        ? { devDependencies }
        : { devDependencies: undefined }),
    };
    if (!nextPkg.devDependencies) delete nextPkg.devDependencies;
    return `${JSON.stringify(nextPkg, null, 2)}\n`;
  } catch {
    return `${JSON.stringify(base, null, 2)}\n`;
  }
}
