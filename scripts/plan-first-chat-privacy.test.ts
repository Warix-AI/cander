/**
 * Plan-first private JSON must not stream into chat.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

describe("plan-first private artifacts stay off chat", () => {
  it("generateBuildPlan and buildProjectSpecFromBrief suppress content deltas", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const rel of [
      "../lib/ai/build/plan/generate-plan.ts",
      "../lib/ai/build/plan/project-spec.ts",
    ]) {
      const src = readFileSync(join(here, rel), "utf8");
      assert.ok(
        src.includes("suppressContentDelta: true"),
        `${rel} must hide plan/spec JSON from the chat stream`,
      );
    }
  });
});
