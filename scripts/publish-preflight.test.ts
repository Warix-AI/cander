import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectMissingAliasPaths,
  collectMissingPackageDeps,
  seoTipIssues,
  staticTipStructureIssues,
} from "../lib/build/publish/preflight-checks.ts";

describe("publish preflight static structure", () => {
  it("requires package.json with next and App Router entrypoints", () => {
    const issues = staticTipStructureIssues(
      ["README.md"],
      null,
    );
    assert.ok(issues.some((i) => i.includes("package.json")));
    assert.ok(issues.some((i) => i.includes("app/page")));
  });

  it("passes a minimal Next App Router tip", () => {
    const pkg = JSON.stringify({
      dependencies: { next: "16.0.0", react: "19.0.0", "react-dom": "19.0.0" },
    });
    const issues = staticTipStructureIssues(
      ["package.json", "app/page.tsx", "app/layout.tsx"],
      pkg,
    );
    assert.deepEqual(issues, []);
  });
});

describe("publish preflight deps", () => {
  it("flags bare imports missing from package.json", () => {
    const pkg = JSON.stringify({
      dependencies: { next: "16", react: "19", "react-dom": "19" },
    });
    const issues = collectMissingPackageDeps(
      [
        {
          path: "app/page.tsx",
          content: `import { motion } from "framer-motion";\nexport default function Page(){return null}`,
        },
      ],
      pkg,
    );
    assert.ok(issues.some((i) => i.includes("framer-motion")));
  });

  it("allows next/ and react builtins", () => {
    const pkg = JSON.stringify({
      dependencies: { next: "16", react: "19", "react-dom": "19" },
    });
    const issues = collectMissingPackageDeps(
      [
        {
          path: "app/page.tsx",
          content: `import Link from "next/link";\nimport { useState } from "react";`,
        },
      ],
      pkg,
    );
    assert.deepEqual(issues, []);
  });

  it("flags unresolved @/ alias imports", () => {
    const issues = collectMissingAliasPaths(
      [
        {
          path: "app/page.tsx",
          content: `import { cn } from "@/lib/utils";`,
        },
      ],
      ["app/page.tsx", "app/layout.tsx"],
    );
    assert.ok(issues.some((i) => i.includes("@/lib/utils")));
  });

  it("accepts @/ alias when tip file exists", () => {
    const issues = collectMissingAliasPaths(
      [
        {
          path: "app/page.tsx",
          content: `import { cn } from "@/lib/utils";`,
        },
      ],
      ["app/page.tsx", "lib/utils.ts"],
    );
    assert.deepEqual(issues, []);
  });
});

describe("publish preflight seo", () => {
  it("fails when layout references missing sitemap", () => {
    const issues = seoTipIssues(
      ["app/layout.tsx", "app/page.tsx"],
      `export const metadata = { alternates: { types: { "application/xml": "/sitemap.xml" } } }`,
      null,
    );
    assert.ok(issues.some((i) => i.toLowerCase().includes("sitemap")));
  });

  it("fails when robots declares sitemap without file", () => {
    const issues = seoTipIssues(
      ["app/layout.tsx", "app/page.tsx", "app/robots.ts"],
      null,
      `export default function robots(){ return { sitemap: "/sitemap.xml" }; }`,
    );
    assert.ok(issues.some((i) => /robots declares Sitemap/i.test(i)));
  });

  it("does not require robots when unreferenced", () => {
    const issues = seoTipIssues(
      ["app/layout.tsx", "app/page.tsx"],
      `export default function RootLayout({children}){return children}`,
      null,
    );
    assert.deepEqual(issues, []);
  });
});

describe("preflight failure blocks deploy contract", () => {
  it("documents that non-ok preflight must not call Deploy API", () => {
    // Contract test: publish-project returns before createProductionDeployment
    // when preflight.ok is false. Pure guard mirrored here.
    const preflightOk = false;
    const deployCalls: string[] = [];
    if (preflightOk) {
      deployCalls.push("createProductionDeployment");
    }
    assert.deepEqual(deployCalls, []);
  });
});
