/**
 * Normalize raw 21st.dev vendor source into Cander project structure.
 */

import type { ComponentDependencyManifest } from "@/lib/ai/build/twenty-first/types";

export type NormalizeComponentResult = {
  code: string;
  changes: string[];
};

/**
 * Rewrite imports / directives so the component compiles in a Cander Next site.
 */
export function normalizeComponentSource(opts: {
  code: string;
  componentId: string;
  componentName: string;
  category: string;
  manifest: ComponentDependencyManifest;
}): NormalizeComponentResult {
  let code = opts.code;
  const changes: string[] = [];

  // Drop blocked AI SDK imports (component should already be rejected if heavily used)
  const beforeAi = code;
  code = code.replace(
    /^\s*import\s+type\s+\{[^}]+\}\s+from\s+["']ai["'];?\s*$/gm,
    "",
  );
  code = code.replace(
    /^\s*import\s+\{[^}]*\}\s+from\s+["']ai["'];?\s*$/gm,
    "",
  );
  if (code !== beforeAi) changes.push("Removed blocked `ai` package imports");

  // classnames → clsx
  if (/from\s+["']classnames["']/.test(code)) {
    code = code.replace(
      /import\s+(\w+)\s+from\s+["']classnames["']/g,
      'import { clsx as $1 } from "clsx"',
    );
    code = code.replace(/from\s+["']classnames["']/g, 'from "clsx"');
    changes.push("Rewrote classnames → clsx");
  }

  // Ensure @/lib/utils for cn when bare cn is used without import
  if (/\bcn\s*\(/.test(code) && !/from\s+["']@\/lib\/utils["']/.test(code)) {
    code = `import { cn } from "@/lib/utils";\n${code}`;
    changes.push("Added missing cn import from @/lib/utils");
  }

  // Client directive for interactive components
  if (opts.manifest.needsClientDirective && !/^\s*["']use client["']/m.test(code)) {
    code = `"use client";\n${code}`;
    changes.push('Added "use client" directive');
  }

  // Strip leftover @ts-nocheck if any prior pipeline added it
  if (/^\s*\/\/\s*@ts-nocheck/m.test(code)) {
    code = code.replace(/^\s*\/\/\s*@ts-nocheck\s*\n?/m, "");
    changes.push("Removed @ts-nocheck suppression");
  }

  const banner = [
    `/* 21st.dev component (normalized for Cander)`,
    ` * id: ${opts.componentId}`,
    ` * name: ${opts.componentName}`,
    ` * role: ${opts.category}`,
    ` * Adapt props/copy/tokens to SiteSpec; keep structure.`,
    ` */`,
    "",
  ].join("\n");

  if (!code.includes("21st.dev component")) {
    code = `${banner}${code}`;
    changes.push("Added Cander provenance banner");
  }

  // Soften framer-motion transition typing issues by casting variants objects when present
  // Prefer `as const` on ease/type string literals in common patterns
  const softened = code.replace(
    /(ease:\s*)(["'])(ease(?:In|Out|InOut)|linear)\2/g,
    "$1$2$3$2 as const",
  );
  if (softened !== code) {
    code = softened;
    changes.push("Added `as const` to framer-motion ease literals");
  }
  const softenedType = code.replace(
    /(type:\s*)(["'])(spring|tween|inertia)\2/g,
    "$1$2$3$2 as const",
  );
  if (softenedType !== code) {
    code = softenedType;
    changes.push("Added `as const` to framer-motion type literals");
  }

  return { code: code.trimEnd() + "\n", changes };
}
