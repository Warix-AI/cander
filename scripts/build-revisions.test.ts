import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gitStoragePointer,
  isGitSha,
  parseGitStoragePointer,
  shortSha,
} from "../lib/build/git/revision-pointers.ts";

describe("revision pointers", () => {
  it("formats and parses git:{sha}", () => {
    assert.equal(
      gitStoragePointer("Abcdef0123456789abcdef0123456789abcdef01"),
      "git:abcdef0123456789abcdef0123456789abcdef01",
    );
    assert.equal(
      parseGitStoragePointer("git:abcdef0"),
      "abcdef0",
    );
    assert.equal(parseGitStoragePointer("draft://x"), null);
    assert.equal(parseGitStoragePointer("candidate://x"), null);
  });

  it("rejects invalid SHAs", () => {
    assert.throws(() => gitStoragePointer("not-a-sha"));
    assert.equal(isGitSha("abcdef0"), true);
    assert.equal(isGitSha("zzzzzzz"), false);
  });

  it("shortens SHAs", () => {
    assert.equal(shortSha("abcdef0123456789"), "abcdef0");
  });
});
