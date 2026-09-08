import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gitStoragePointer,
  isGitSha,
  shortSha,
} from "../lib/build/git/revision-pointers.ts";

describe("publish revision pointers", () => {
  it("keys published tip as git sha", () => {
    const sha = "abcdef0123456789abcdef0123456789abcdef01";
    assert.equal(gitStoragePointer(sha), `git:${sha}`);
    assert.equal(shortSha(sha), "abcdef0");
    assert.equal(isGitSha(sha), true);
  });

  it("rejects empty publish tip", () => {
    assert.equal(isGitSha(""), false);
    assert.throws(() => gitStoragePointer(""));
  });
});

describe("vercel project naming", () => {
  it("sanitizes repo names for vercel", () => {
    const fullName = "Warix-AI/cander-abc123_DEF";
    const repo = fullName.split("/")[1] || "x";
    const name = repo
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 52);
    assert.equal(name, "cander-abc123-def");
  });
});
