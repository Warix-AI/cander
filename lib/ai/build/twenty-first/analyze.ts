/**
 * Parse a 21st.dev component source into a dependency manifest.
 */

import { createHash } from "crypto";
import type { RetrievedComponentRef } from "@/lib/ai/build/website-setup-brief";
import type {
  ComponentDependencyManifest,
  LocalFileRequirement,
  PackageRequirement,
} from "@/lib/ai/build/twenty-first/types";
import {
  BLOCKED_PACKAGES,
  BUILTIN_MODULES,
  resolvePackageVersion,
} from "@/lib/ai/build/twenty-first/known-packages";

const IMPORT_RE =
  /(?:import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s*|require\s*\(\s*|export\s+[\s\S]*?\s+from\s*)["']([^"']+)["']/g;

const TAILWIND_HINT_RE =
  /\b(?:className|class)=["'`][^"'`]*(?:flex|grid|bg-|text-|p-|m-|w-|h-|rounded|border|gap-|items-|justify-|hover:|md:|lg:|sm:|xl:)/;

const CLIENT_HINT_RE =
  /\b(?:useState|useEffect|useRef|useMemo|useCallback|useLayoutEffect|useReducer|useContext|motion\.|AnimatePresence|onClick|onChange|onSubmit|window\.|document\.|localStorage)\b/;

function contentHash(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 16);
}

function packageNameFromSpecifier(spec: string): string {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  return spec.split("/")[0] || spec;
}

function uiPrimitiveFromPath(spec: string): string | null {
  const m = spec.match(/^@\/components\/ui\/([a-zA-Z0-9_-]+)$/);
  return m?.[1] ?? null;
}

/**
 * Analyze one retrieved component's source for install/normalize requirements.
 */
export function analyzeComponentManifest(
  component: RetrievedComponentRef,
): ComponentDependencyManifest {
  const code = component.codeSnippet?.trim() || "";
  const imports: string[] = [];
  const npmPackages: PackageRequirement[] = [];
  const localFiles: LocalFileRequirement[] = [];
  const unresolvedImports: string[] = [];
  const notes: string[] = [];
  const seenPkg = new Set<string>();
  const seenLocal = new Set<string>();

  if (!code) {
    return {
      componentId: component.id,
      componentName: component.name,
      category: component.category,
      contentHash: "empty",
      npmPackages: [],
      localFiles: [],
      imports: [],
      needsClientDirective: false,
      needsTailwind: false,
      needsCnHelper: false,
      unresolvedImports: ["<empty codeSnippet>"],
      notes: ["No code snippet — cannot analyze"],
    };
  }

  let match: RegExpExecArray | null;
  const re = new RegExp(IMPORT_RE.source, "g");
  while ((match = re.exec(code)) !== null) {
    const spec = (match[1] || "").trim();
    if (!spec) continue;
    imports.push(spec);

    if (spec.startsWith(".") || spec.startsWith("..")) {
      unresolvedImports.push(spec);
      notes.push(`Relative import ${spec} is not supported in vendor pastes`);
      continue;
    }

    if (spec === "@/lib/utils" || spec.endsWith("/lib/utils")) {
      if (!seenLocal.has("lib/utils.ts")) {
        seenLocal.add("lib/utils.ts");
        localFiles.push({
          path: "lib/utils.ts",
          kind: "helper",
          reason: `cn() helper for ${component.id}`,
        });
      }
      continue;
    }

    const ui = uiPrimitiveFromPath(spec);
    if (ui) {
      const path = `components/ui/${ui}.tsx`;
      if (!seenLocal.has(path)) {
        seenLocal.add(path);
        localFiles.push({
          path,
          kind: "ui-primitive",
          reason: `Imported by ${component.id}`,
        });
      }
      continue;
    }

    if (spec.startsWith("@/")) {
      const path = `${spec.slice(2)}.tsx`;
      const alt = `${spec.slice(2)}.ts`;
      unresolvedImports.push(spec);
      notes.push(`Unknown project alias ${spec} (expected ${path} or ${alt})`);
      continue;
    }

    if (BUILTIN_MODULES.has(spec) || BUILTIN_MODULES.has(packageNameFromSpecifier(spec))) {
      continue;
    }

    const pkg = packageNameFromSpecifier(spec);
    if (BLOCKED_PACKAGES.has(pkg)) {
      unresolvedImports.push(spec);
      notes.push(`Blocked package ${pkg} — marketing sites cannot depend on it`);
      continue;
    }

    if (!seenPkg.has(pkg)) {
      seenPkg.add(pkg);
      const version = resolvePackageVersion(pkg);
      if (!version) {
        unresolvedImports.push(spec);
        notes.push(`Could not resolve package for ${spec}`);
      } else {
        npmPackages.push({
          name: pkg,
          version,
          reason: `Imported as ${spec}`,
        });
      }
    }
  }

  // MCP-declared dependencies
  for (const dep of component.dependencies ?? []) {
    const name = String(dep || "").trim();
    if (!name || seenPkg.has(name)) continue;
    if (BLOCKED_PACKAGES.has(name)) {
      unresolvedImports.push(name);
      notes.push(`Blocked MCP dependency ${name}`);
      continue;
    }
    if (BUILTIN_MODULES.has(name)) continue;
    const version = resolvePackageVersion(name);
    if (!version) {
      unresolvedImports.push(name);
      continue;
    }
    seenPkg.add(name);
    npmPackages.push({
      name,
      version,
      reason: "Declared in 21st MCP dependencies metadata",
    });
  }

  const needsCnHelper =
    /\bcn\s*\(/.test(code) || imports.some((i) => i.includes("lib/utils"));
  if (needsCnHelper && !seenLocal.has("lib/utils.ts")) {
    localFiles.push({
      path: "lib/utils.ts",
      kind: "helper",
      reason: "cn() usage detected",
    });
  }

  const needsTailwind = TAILWIND_HINT_RE.test(code);
  if (needsTailwind) {
    for (const [name, version] of [
      ["tailwindcss", resolvePackageVersion("tailwindcss")!],
      ["@tailwindcss/postcss", resolvePackageVersion("@tailwindcss/postcss")!],
      ["postcss", resolvePackageVersion("postcss")!],
    ] as const) {
      if (!seenPkg.has(name)) {
        seenPkg.add(name);
        npmPackages.push({
          name,
          version,
          reason: "Tailwind utility classes detected",
        });
      }
    }
    if (!seenLocal.has("postcss.config.mjs")) {
      localFiles.push({
        path: "postcss.config.mjs",
        kind: "config",
        reason: "Tailwind PostCSS pipeline",
      });
    }
  }

  // UI primitives often need radix peers — add when those files are required.
  for (const lf of localFiles) {
    if (lf.kind !== "ui-primitive") continue;
    const base = lf.path.replace(/^components\/ui\//, "").replace(/\.tsx$/, "");
    const radixPeers: Record<string, string[]> = {
      accordion: ["@radix-ui/react-accordion"],
      select: ["@radix-ui/react-select"],
      sheet: ["@radix-ui/react-dialog"],
      dialog: ["@radix-ui/react-dialog"],
      label: ["@radix-ui/react-label"],
      checkbox: ["@radix-ui/react-checkbox"],
      switch: ["@radix-ui/react-switch"],
      tabs: ["@radix-ui/react-tabs"],
      separator: ["@radix-ui/react-separator"],
      "dropdown-menu": ["@radix-ui/react-dropdown-menu"],
      popover: ["@radix-ui/react-popover"],
      avatar: ["@radix-ui/react-avatar"],
      button: ["@radix-ui/react-slot", "class-variance-authority"],
    };
    for (const peer of radixPeers[base] ?? []) {
      if (seenPkg.has(peer)) continue;
      const version = resolvePackageVersion(peer);
      if (!version) continue;
      seenPkg.add(peer);
      npmPackages.push({
        name: peer,
        version,
        reason: `Peer for UI primitive ${base}`,
      });
    }
  }

  if (needsCnHelper) {
    for (const peer of ["clsx", "tailwind-merge"] as const) {
      if (seenPkg.has(peer)) continue;
      seenPkg.add(peer);
      npmPackages.push({
        name: peer,
        version: resolvePackageVersion(peer)!,
        reason: "Required by cn() helper",
      });
    }
  }

  const needsClientDirective =
    !/^\s*["']use client["']/m.test(code) && CLIENT_HINT_RE.test(code);

  // Always ensure tsconfig path alias exists when @/ imports are present
  if (imports.some((i) => i.startsWith("@/"))) {
    if (!seenLocal.has("tsconfig.json")) {
      localFiles.push({
        path: "tsconfig.json",
        kind: "config",
        reason: "@/* path alias required",
      });
    }
  }

  return {
    componentId: component.id,
    componentName: component.name,
    category: component.category,
    contentHash: contentHash(code),
    npmPackages,
    localFiles,
    imports,
    needsClientDirective,
    needsTailwind,
    needsCnHelper,
    unresolvedImports,
    notes,
  };
}
