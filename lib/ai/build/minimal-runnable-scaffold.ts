/**
 * Minimal Next App Router files so a draft tip can boot (no SiteSpec required).
 * Used by git ensure + client heal paths when create left an incomplete tip.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import { canonicalSitePackageJsonText } from "@/lib/ai/build/site-package";
import { siteSupportScaffoldFiles } from "@/lib/ai/build/site-support-files";

export const RUNNABLE_CORE_PATHS = [
  "package.json",
  "next.config.mjs",
  "app/layout.tsx",
  "app/page.tsx",
  "app/globals.css",
] as const;

export function tipLooksRunnable(paths: string[]): boolean {
  const set = new Set(paths.map((p) => p.replace(/^\.\//, "")));
  const hasPkg = set.has("package.json");
  const hasPage = [...set].some((p) =>
    /^app\/page\.(tsx|ts|jsx|js)$/.test(p),
  );
  const hasLayout = [...set].some((p) =>
    /^app\/layout\.(tsx|ts|jsx|js)$/.test(p),
  );
  return hasPkg && hasPage && hasLayout;
}

export function minimalRunnableScaffoldFiles(opts?: {
  name?: string;
  title?: string;
}): ScaffoldFile[] {
  const title = (opts?.title || "Site").replace(/`/g, "");
  const name = opts?.name?.trim() || "cander-site";
  return [
    {
      path: "package.json",
      content: canonicalSitePackageJsonText({ name }),
    },
    {
      path: "next.config.mjs",
      content: "export default {};\n",
    },
    {
      path: ".gitignore",
      content: ["node_modules", ".next", ".npm", "package-lock.json", ".DS_Store", ""].join(
        "\n",
      ),
    },
    ...siteSupportScaffoldFiles(),
    {
      path: "app/globals.css",
      content: `:root { color-scheme: light; }
body { margin: 0; font-family: system-ui, sans-serif; }
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(`${title} — draft site`)},
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `export default function HomePage() {
  return (
    <main style={{ padding: "3rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>${title.replace(/[<>]/g, "")}</h1>
      <p style={{ opacity: 0.8, lineHeight: 1.5 }}>
        Draft is booting. Ask Cander to refine this page anytime.
      </p>
    </main>
  );
}
`,
    },
    {
      path: "app/robots.ts",
      content: `import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "/sitemap.xml",
  };
}
`,
    },
    {
      path: "app/sitemap.ts",
      content: `import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "/", lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
`,
    },
  ];
}
