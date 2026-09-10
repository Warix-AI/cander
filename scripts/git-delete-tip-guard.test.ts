/**
 * Guard: never send sha:null deletes for paths missing from the tip.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deletePathsForPreferredWrites,
  filterDeletesToExistingPaths,
} from "../lib/ai/build/routes/app-router-conflicts.ts";

describe("filterDeletesToExistingPaths", () => {
  it("drops missing tip paths so GitHub create-tree won't BadObjectState", () => {
    const candidates = deletePathsForPreferredWrites([
      { path: "app/page.tsx" },
      { path: "app/layout.tsx" },
    ]);
    assert.ok(candidates.includes("app/page.js"));
    assert.deepEqual(filterDeletesToExistingPaths(candidates, []), []);
    assert.deepEqual(
      filterDeletesToExistingPaths(candidates, ["app/page.js", "package.json"]),
      ["app/page.js"],
    );
  });
});
