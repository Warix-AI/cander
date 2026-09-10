import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  editPathAllowsMidLoopPersist,
  editPathAllowsPublish,
  editToolNamesFromBuildDomain,
} from "../lib/ai/build/edit-guards.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("Phase 4 edit path — zero production deploys", () => {
  it("edit allowlist never includes publish or mid-loop persist", () => {
    const tools = editToolNamesFromBuildDomain([
      "build.component.search",
      "build.publish",
      "build.supabase.setup",
    ]);
    assert.equal(editPathAllowsPublish(tools), false);
    assert.equal(editPathAllowsMidLoopPersist(tools), false);
    assert.ok(!tools.includes("build.publish"));
    assert.ok(tools.includes("computer.files.write"));
  });

  it("edit-pipeline module does not import publish or full compose", () => {
    const src = readFileSync(
      join(here, "../lib/ai/build/edit-pipeline.ts"),
      "utf8",
    );
    assert.equal(/publishProject|publish-project|promoteDraftSha/.test(src), false);
    assert.equal(/composeSiteFromSpec|planWebsite/.test(src), false);
  });

  it("site edit branch in project-turn routes to runEditWebsitePipeline", () => {
    const src = readFileSync(
      join(here, "../lib/ai/build/project-turn.ts"),
      "utf8",
    );
    assert.ok(src.includes("runEditWebsitePipeline"));
    assert.ok(src.includes("Phase 4 — conversational draft-only edits"));
    assert.equal(
      /Still dumped code with no writes — fall back to SiteSpec compose/.test(
        src,
      ),
      false,
    );
  });
});
