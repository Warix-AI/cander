/**
 * Support files every generated site needs when 21st.dev (or Codex) drops
 * shadcn-style imports: `@/lib/utils`, framer-motion, lucide-react, UI primitives.
 *
 * Prefer the normalize pipeline (`lib/ai/build/twenty-first/pipeline.ts`) for
 * full analyze → install → validate. This module remains the shared kit used by
 * compose-site / publish repair.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import {
  SITE_LIB_UTILS_TS,
  SITE_TSCONFIG_JSON,
  resolveUiPrimitiveFiles,
} from "@/lib/ai/build/twenty-first/ui-primitives";

export const SITE_COMMON_DEPENDENCIES: Record<string, string> = {
  clsx: "^2.1.1",
  "tailwind-merge": "^3.3.1",
  "class-variance-authority": "^0.7.1",
  "framer-motion": "^12.23.12",
  "lucide-react": "^0.542.0",
  "@radix-ui/react-slot": "^1.2.3",
};

export { SITE_LIB_UTILS_TS, SITE_TSCONFIG_JSON };

/** Strip blocked AI SDK imports from vendor pastes (no @ts-nocheck). */
export function sanitizeTwentyFirstVendorSource(source: string): string {
  let out = source;
  out = out.replace(
    /^\s*import\s+type\s+\{[^}]+\}\s+from\s+["']ai["'];?\s*$/gm,
    "",
  );
  out = out.replace(
    /^\s*import\s+\{[^}]*\b(?:DynamicToolUIPart|ToolUIPart)\b[^}]*\}\s+from\s+["']ai["'];?\s*$/gm,
    "",
  );
  // Remove prior suppression if present — components must compile for real.
  out = out.replace(/^\s*\/\/\s*@ts-nocheck\s*\n?/m, "");
  return out;
}

const DEFAULT_UI = [
  "button",
  "input",
  "label",
  "textarea",
  "card",
  "select",
  "accordion",
  "sheet",
  "search-modal",
  "play-store-button",
  "app-store-button",
];

export function siteSupportScaffoldFiles(): ScaffoldFile[] {
  const { files: ui } = resolveUiPrimitiveFiles(DEFAULT_UI);
  return [
    { path: "tsconfig.json", content: SITE_TSCONFIG_JSON },
    { path: "lib/utils.ts", content: SITE_LIB_UTILS_TS },
    ...ui,
  ];
}
