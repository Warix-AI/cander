/**
 * 21st → analyze → resolve/install files → normalize → preflight.
 * Runs before Codex composes the site.
 */

import type { RetrievedComponentRef } from "@/lib/ai/build/website-setup-brief";
import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import { analyzeComponentManifest } from "@/lib/ai/build/twenty-first/analyze";
import {
  getCachedManifest,
  setCachedManifest,
} from "@/lib/ai/build/twenty-first/cache";
import { normalizeComponentSource } from "@/lib/ai/build/twenty-first/normalize";
import { preflightNormalizedComponents } from "@/lib/ai/build/twenty-first/preflight";
import type {
  NormalizedTwentyFirstComponent,
  TwentyFirstNormalizeResult,
} from "@/lib/ai/build/twenty-first/types";
import {
  SITE_LIB_UTILS_TS,
  SITE_POSTCSS_CONFIG,
  SITE_TSCONFIG_JSON,
  resolveUiPrimitiveFiles,
  tailwindGlobalsPrefix,
} from "@/lib/ai/build/twenty-first/ui-primitives";
import { SITE_COMMON_DEPENDENCIES } from "@/lib/ai/build/site-support-files";
import { vendorPathForComponent } from "@/lib/ai/build/twenty-first-mcp";

const LOG = "[cander:21st-normalize]";

function logInfo(msg: string, data?: Record<string, unknown>) {
  if (data) console.info(LOG, msg, data);
  else console.info(LOG, msg);
}

function logWarn(msg: string, data?: Record<string, unknown>) {
  if (data) console.warn(LOG, msg, data);
  else console.warn(LOG, msg);
}

function mergePackageDeps(
  ...maps: Array<Record<string, string>>
): Record<string, string> {
  const out: Record<string, string> = { ...SITE_COMMON_DEPENDENCIES };
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      if (!out[k] || out[k] === "latest" || v !== "latest") out[k] = v;
    }
  }
  return out;
}

/**
 * Full normalize pipeline for retrieved 21st components.
 */
export function normalizeTwentyFirstPipeline(opts: {
  components: RetrievedComponentRef[];
  existingGlobalsCss?: string | null;
}): TwentyFirstNormalizeResult {
  const logs: string[] = [];
  const dropped: TwentyFirstNormalizeResult["dropped"] = [];
  let usedCache = 0;

  const selected = opts.components.filter((c) => c.codeSnippet?.trim());
  logs.push(
    `Selected component IDs: ${selected.map((c) => `${c.category}:${c.id}`).join(", ") || "(none)"}`,
  );
  logInfo("start", {
    selected: selected.map((c) => `${c.category}:${c.id}`),
    count: selected.length,
  });

  if (selected.length === 0) {
    return {
      ok: false,
      components: [],
      dropped: [],
      files: [],
      packageDependencies: { ...SITE_COMMON_DEPENDENCIES },
      logs: [...logs, "No 21st code snippets — fallback to catalog"],
      usedCache: 0,
      fallbackToCatalog: true,
    };
  }

  const packageDependencies: Record<string, string> = {
    ...SITE_COMMON_DEPENDENCIES,
  };
  const localPaths = new Set<string>();
  const uiNames = new Set<string>();
  let needsTailwind = false;
  let needsUtils = false;
  let needsTsconfig = true;

  type Working = {
    component: RetrievedComponentRef;
    manifest: ReturnType<typeof analyzeComponentManifest>;
    fromCache: boolean;
  };
  const working: Working[] = [];

  for (const component of selected) {
    const provisional = analyzeComponentManifest(component);
    const cached = getCachedManifest(
      component.id,
      provisional.contentHash,
    );
    const manifest = cached ?? provisional;
    if (cached) {
      usedCache += 1;
      logs.push(`Cache hit for ${component.id} (${manifest.contentHash})`);
    } else {
      setCachedManifest(manifest);
      logs.push(
        `Analyzed ${component.id}: pkgs=${manifest.npmPackages.map((p) => p.name).join(",") || "∅"} ui=${manifest.localFiles
          .filter((f) => f.kind === "ui-primitive")
          .map((f) => f.path)
          .join(",") || "∅"}`,
      );
      logInfo("manifest", {
        id: component.id,
        packages: manifest.npmPackages.map((p) => p.name),
        localFiles: manifest.localFiles.map((f) => f.path),
        unresolved: manifest.unresolvedImports,
        notes: manifest.notes,
      });
    }

    // Hard fail components with blocked/unresolvable imports
    if (manifest.unresolvedImports.length > 0) {
      const reason = `Unresolved imports: ${manifest.unresolvedImports.join(", ")}`;
      dropped.push({ id: component.id, name: component.name, reason });
      logs.push(`DROP ${component.id}: ${reason}`);
      logWarn("drop", { id: component.id, reason });
      continue;
    }

    for (const pkg of manifest.npmPackages) {
      packageDependencies[pkg.name] = pkg.version;
    }
    for (const lf of manifest.localFiles) {
      localPaths.add(lf.path);
      if (lf.kind === "ui-primitive") {
        uiNames.add(
          lf.path.replace(/^components\/ui\//, "").replace(/\.tsx$/, ""),
        );
      }
      if (lf.path === "lib/utils.ts") needsUtils = true;
      if (lf.path === "tsconfig.json") needsTsconfig = true;
      if (lf.path === "postcss.config.mjs") needsTailwind = true;
    }
    if (manifest.needsTailwind) needsTailwind = true;
    if (manifest.needsCnHelper) needsUtils = true;

    working.push({ component, manifest, fromCache: Boolean(cached) });
  }

  if (working.length === 0) {
    logs.push(
      "All retrieved 21st components failed analysis — falling back to Cander catalog",
    );
    logWarn("fallback-catalog", { dropped });
    return {
      ok: false,
      components: [],
      dropped,
      files: [],
      packageDependencies,
      logs,
      usedCache,
      fallbackToCatalog: true,
    };
  }

  // Resolve UI primitives
  const { files: uiFiles, missing: missingUi } = resolveUiPrimitiveFiles([
    ...uiNames,
  ]);
  if (missingUi.length) {
    // Drop any component that required a missing primitive
    const still: Working[] = [];
    for (const w of working) {
      const needed = w.manifest.localFiles
        .filter((f) => f.kind === "ui-primitive")
        .map((f) =>
          f.path.replace(/^components\/ui\//, "").replace(/\.tsx$/, ""),
        );
      const bad = needed.filter((n) => missingUi.includes(n));
      if (bad.length) {
        const reason = `No UI primitive for: ${bad.join(", ")}`;
        dropped.push({
          id: w.component.id,
          name: w.component.name,
          reason,
        });
        logs.push(`DROP ${w.component.id}: ${reason}`);
        logWarn("drop-missing-ui", { id: w.component.id, bad });
      } else {
        still.push(w);
      }
    }
    working.length = 0;
    working.push(...still);
  }

  if (working.length === 0) {
    logs.push("No components left after UI resolution — catalog fallback");
    return {
      ok: false,
      components: [],
      dropped,
      files: [],
      packageDependencies,
      logs,
      usedCache,
      fallbackToCatalog: true,
    };
  }

  logs.push(
    `Packages to install: ${Object.keys(packageDependencies).sort().join(", ")}`,
  );
  logs.push(
    `UI primitives created: ${uiFiles.map((f) => f.path).join(", ") || "(none)"}`,
  );

  // Normalize sources
  const normalized: NormalizedTwentyFirstComponent[] = [];
  const vendorFiles: ScaffoldFile[] = [];
  for (const w of working) {
    const { code, changes } = normalizeComponentSource({
      code: w.component.codeSnippet || "",
      componentId: w.component.id,
      componentName: w.component.name,
      category: w.component.category,
      manifest: w.manifest,
    });
    const path = vendorPathForComponent(w.component);
    logs.push(
      `Normalized ${w.component.id} → ${path}: ${changes.join("; ") || "no changes"}`,
    );
    logInfo("normalize", { id: w.component.id, path, changes });
    const entry: NormalizedTwentyFirstComponent = {
      id: w.component.id,
      name: w.component.name,
      category: w.component.category,
      source: w.component.source || "twenty_first",
      codeSnippet: code,
      dependencies: w.manifest.npmPackages.map((p) => p.name),
      path,
      manifest: w.manifest,
      normalizationChanges: changes,
    };
    normalized.push(entry);
    vendorFiles.push({ path, content: code });
  }

  // Support files
  const support: ScaffoldFile[] = [...uiFiles];
  if (needsUtils || localPaths.has("lib/utils.ts")) {
    support.push({ path: "lib/utils.ts", content: SITE_LIB_UTILS_TS });
  }
  if (needsTsconfig) {
    support.push({ path: "tsconfig.json", content: SITE_TSCONFIG_JSON });
  }
  if (needsTailwind) {
    support.push({ path: "postcss.config.mjs", content: SITE_POSTCSS_CONFIG });
    const existing = opts.existingGlobalsCss?.trim() || "";
    const globals = existing.includes('@import "tailwindcss"')
      ? existing
      : `${tailwindGlobalsPrefix()}${existing || "/* site tokens */\n"}`;
    support.push({ path: "app/globals.css", content: globals });
    Object.assign(
      packageDependencies,
      mergePackageDeps(packageDependencies, {
        tailwindcss: packageDependencies.tailwindcss || "^4.1.12",
        "@tailwindcss/postcss":
          packageDependencies["@tailwindcss/postcss"] || "^4.1.12",
        postcss: packageDependencies.postcss || "^8.5.6",
      }),
    );
  }

  // Ensure lucide when any UI uses it
  if (
    uiFiles.some((f) => f.content.includes("lucide-react")) &&
    !packageDependencies["lucide-react"]
  ) {
    packageDependencies["lucide-react"] = "^0.542.0";
  }
  if (
    uiFiles.some((f) => f.content.includes("@radix-ui/react-slot")) &&
    !packageDependencies["@radix-ui/react-slot"]
  ) {
    packageDependencies["@radix-ui/react-slot"] = "^1.2.3";
  }
  if (
    uiFiles.some((f) => f.content.includes("class-variance-authority")) &&
    !packageDependencies["class-variance-authority"]
  ) {
    packageDependencies["class-variance-authority"] = "^0.7.1";
  }

  const files = [...support, ...vendorFiles];

  // Preflight — drop failing components and retry once on remaining set
  let preflight = preflightNormalizedComponents({
    components: normalized,
    files,
    packageDependencies,
  });

  if (!preflight.ok) {
    logs.push(`Preflight issues: ${preflight.issues.join(" | ")}`);
    logWarn("preflight", { issues: preflight.issues });

    const failingIds = new Set<string>();
    for (const issue of preflight.issues) {
      const id = issue.split(":")[0]?.trim();
      if (id && normalized.some((n) => n.id === id)) failingIds.add(id);
    }

    if (failingIds.size) {
      for (const id of failingIds) {
        const c = normalized.find((n) => n.id === id);
        if (!c) continue;
        const reason =
          preflight.issues.filter((i) => i.startsWith(`${id}:`)).join("; ") ||
          "preflight failed";
        dropped.push({ id, name: c.name, reason });
        logs.push(`DROP ${id} after preflight: ${reason}`);
      }
      const kept = normalized.filter((n) => !failingIds.has(n.id));
      normalized.length = 0;
      normalized.push(...kept);
      // Rebuild vendor file list
      const keptPaths = new Set(normalized.map((n) => n.path));
      const nextFiles = files.filter(
        (f) =>
          !f.path.startsWith("components/twenty-first/") ||
          keptPaths.has(f.path),
      );
      files.length = 0;
      files.push(...nextFiles);
    }

    preflight = preflightNormalizedComponents({
      components: normalized,
      files,
      packageDependencies,
    });
  }

  // Soft asset warnings shouldn't block
  const hardIssues = preflight.issues.filter(
    (i) => !i.includes("asset ") && !i.includes("will 404"),
  );
  const ok = normalized.length > 0 && hardIssues.length === 0;

  if (!ok) {
    logs.push(
      hardIssues.length
        ? `Preflight still failing: ${hardIssues.join(" | ")} — catalog fallback`
        : "No normalized components survived — catalog fallback",
    );
  } else {
    logs.push(
      `Ready for Codex: ${normalized.map((n) => n.id).join(", ")} (${files.length} support/vendor files)`,
    );
  }

  logInfo("done", {
    ok,
    kept: normalized.map((n) => n.id),
    dropped: dropped.map((d) => d.id),
    packages: Object.keys(packageDependencies),
    files: files.map((f) => f.path),
    usedCache,
  });

  return {
    ok,
    components: normalized,
    dropped,
    files,
    packageDependencies,
    logs,
    usedCache,
    fallbackToCatalog: !ok,
  };
}

/** Convert normalized components back to RetrievedComponentRef for brief storage. */
export function normalizedToRetrievedRefs(
  components: NormalizedTwentyFirstComponent[],
): RetrievedComponentRef[] {
  return components.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    source: c.source,
    codeSnippet: c.codeSnippet,
    dependencies: c.dependencies,
  }));
}
