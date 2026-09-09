import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  repairSeoConsistencyFiles,
  robotsDeclaresSitemap,
  seoConsistencyIssues,
} from "../lib/ai/build/seo-consistency.ts";
import { formatPublishUserError } from "../lib/publish/format-publish-error.ts";

describe("seo consistency", () => {
  it("detects robots sitemap field", () => {
    assert.equal(
      robotsDeclaresSitemap(`sitemap: "https://example.com/sitemap.xml"`),
      true,
    );
    assert.equal(robotsDeclaresSitemap(`rules: { allow: "/" }`), false);
  });

  it("flags robots without sitemap file", () => {
    const issues = seoConsistencyIssues({
      paths: ["app/robots.ts", "app/page.tsx"],
      robotsContent: `export default function robots(){ return { sitemap: "/sitemap.xml" }; }`,
      requireBoth: false,
    });
    assert.ok(issues.some((i) => /robots declares Sitemap/i.test(i)));
  });

  it("repairs by writing robots + sitemap atomically", () => {
    const { files, repaired } = repairSeoConsistencyFiles({
      files: [
        {
          path: "app/robots.ts",
          content: `export default function robots(){ return { sitemap: "https://example.com/sitemap.xml" }; }`,
        },
        { path: "app/page.tsx", content: "export default function Page(){return null}" },
      ],
    });
    assert.equal(repaired, true);
    assert.ok(files.some((f) => f.path === "app/sitemap.ts"));
    const robots = files.find((f) => f.path === "app/robots.ts")!.content;
    assert.ok(robotsDeclaresSitemap(robots));
    const after = seoConsistencyIssues({
      paths: files.map((f) => f.path),
      robotsContent: robots,
      requireBoth: true,
    });
    assert.deepEqual(after, []);
  });
});

describe("formatPublishUserError", () => {
  it("labels preflight draft issues as repair needed", () => {
    const f = formatPublishUserError(
      "Publish blocked — the draft needs repair before it can go live (this is not a Vercel outage):\n- robots declares Sitemap",
    );
    assert.equal(f.draftNeedsRepair, true);
    assert.equal(f.title, "Draft needs repair");
  });

  it("keeps platform failures as Publish failed", () => {
    const f = formatPublishUserError("VERCEL_TOKEN is required for production deploys.");
    assert.equal(f.draftNeedsRepair, false);
    assert.equal(f.title, "Publish failed");
  });
});
