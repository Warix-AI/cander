/**
 * Boot skeleton for V2 create jobs: the minimum runnable Next 16 + Tailwind v4
 * app so the sandbox can `npm install && next dev` before the builder agent
 * takes over. The agent owns app/** and components/** from there — this is
 * NOT a site template.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import { canonicalSitePackageJsonText } from "@/lib/ai/build/site-package";
import {
  SITE_LIB_UTILS_TS,
  SITE_POSTCSS_CONFIG,
  SITE_TSCONFIG_JSON,
  resolveUiPrimitiveFiles,
} from "@/lib/ai/build/twenty-first/ui-primitives";

const UI_PRIMITIVES = [
  "button",
  "input",
  "label",
  "textarea",
  "card",
  "accordion",
  "sheet",
];

const GLOBALS_CSS = `@import "tailwindcss";

/* Cander boot tokens — the builder replaces these with the brand system. */
:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --muted: #f5f5f5;
  --muted-foreground: #6b7280;
  --border: #e5e7eb;
  --primary: #111827;
  --primary-foreground: #ffffff;
  --radius: 0.75rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --radius-lg: var(--radius);
}

html {
  scroll-behavior: smooth;
}

body {
  background: var(--background);
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
}
`;

function layoutTsx(title: string, kind: "site" | "app") {
  return `import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(`${title} — ${kind === "app" ? "app" : "website"}`)},
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
`;
}

function pageTsx(title: string, kind: "site" | "app") {
  return `export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">${escapeJsx(title)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Drafting your ${kind === "app" ? "app" : "website"}…</p>
      </div>
    </main>
  );
}
`;
}

function escapeJsx(s: string) {
  return s.replace(/[{}<>]/g, "");
}

export function bootSkeletonFiles(opts: {
  name?: string;
  title?: string;
  kind?: "site" | "app";
}): ScaffoldFile[] {
  const kind = opts.kind === "app" ? "app" : "site";
  const title = (opts.title || (kind === "app" ? "New app" : "New site")).slice(0, 80);
  const { files: ui } = resolveUiPrimitiveFiles(UI_PRIMITIVES);
  return [
    {
      path: ".gitignore",
      content: ["node_modules", ".next", ".npm", ".cander", ".DS_Store", ".env*.local", ""].join("\n"),
    },
    { path: "package.json", content: canonicalSitePackageJsonText({ name: opts.name || "cander-site" }) },
    { path: "next.config.mjs", content: "/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nexport default nextConfig;\n" },
    { path: "tsconfig.json", content: SITE_TSCONFIG_JSON },
    { path: "postcss.config.mjs", content: SITE_POSTCSS_CONFIG },
    { path: "lib/utils.ts", content: SITE_LIB_UTILS_TS },
    { path: "app/globals.css", content: GLOBALS_CSS },
    { path: "app/layout.tsx", content: layoutTsx(title, kind) },
    { path: "app/page.tsx", content: pageTsx(title, kind) },
    ...ui,
  ];
}

/** Config files that must always exist for the sandbox to boot. */
export const BOOT_REQUIRED_PATHS = [
  "package.json",
  "app/layout.tsx",
  "app/page.tsx",
  "app/globals.css",
];
