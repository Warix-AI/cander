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
  SITE_POSTCSS_CONFIG,
  SITE_TSCONFIG_JSON,
  resolveUiPrimitiveFiles,
} from "@/lib/ai/build/twenty-first/ui-primitives";

export const SITE_COMMON_DEPENDENCIES: Record<string, string> = {
  // Tailwind v4 is part of the base kit: shadcn primitives and Codex/21st.dev
  // output use utility classes, so globals.css imports tailwind by default.
  tailwindcss: "^4.1.12",
  "@tailwindcss/postcss": "^4.1.12",
  postcss: "^8.5.6",
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

  // embla-carousel-react no longer exports EmblaCarouselType / EmblaOptionsType.
  if (
    /EmblaCarouselType|EmblaOptionsType/.test(out) &&
    /from\s+["']embla-carousel-react["']/.test(out)
  ) {
    out = out.replace(
      /import\s+useEmblaCarousel\s*,\s*\{[\s\S]*?\}\s*from\s*["']embla-carousel-react["'];?/,
      `import useEmblaCarousel from "embla-carousel-react";

type EmblaCarouselType = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;
type EmblaOptionsType = NonNullable<Parameters<typeof useEmblaCarousel>[0]>;`,
    );
  }
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
    { path: "postcss.config.mjs", content: SITE_POSTCSS_CONFIG },
    { path: "lib/utils.ts", content: SITE_LIB_UTILS_TS },
    ...ui,
  ];
}
