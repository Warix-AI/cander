import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeRepoRelativePath } from "../lib/build/git/path-safe.ts";

describe("safeRepoRelativePath", () => {
  it("normalizes workspace prefixes", () => {
    assert.equal(safeRepoRelativePath("workspace/app/page.tsx"), "app/page.tsx");
    assert.equal(safeRepoRelativePath("./src/index.ts"), "src/index.ts");
    assert.equal(safeRepoRelativePath("/README.md"), "README.md");
  });

  it("rejects traversal", () => {
    assert.throws(() => safeRepoRelativePath("../etc/passwd"));
    assert.throws(() => safeRepoRelativePath("foo/../../x"));
  });
});
