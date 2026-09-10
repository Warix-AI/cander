import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  WEAK_BUILD_GIT_AUTHOR_EMAIL,
  buildIdentityConfigIssues,
  tipCommitIdentityIssues,
} from "../lib/build/publish/identity-preflight.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("Phase 5 identity preflight", () => {
  it("rejects tip commits with wrong author email", () => {
    const issues = tipCommitIdentityIssues(
      {
        authorName: "Customer",
        authorEmail: "customer@example.com",
        committerName: "Customer",
        committerEmail: "customer@example.com",
      },
      { name: "Warix Build", email: "ops@warix.ai" },
    );
    assert.ok(issues.some((i) => /Warix Build identity/i.test(i)));
  });

  it("accepts tip when author/committer match configured email", () => {
    const issues = tipCommitIdentityIssues(
      {
        authorName: "Warix Build",
        authorEmail: "ops@warix.ai",
        committerName: "Warix Build",
        committerEmail: "ops@warix.ai",
      },
      { name: "Warix Build", email: "ops@warix.ai" },
    );
    assert.deepEqual(issues, []);
  });

  it("rejects weak github-actions bot default author", () => {
    const issues = tipCommitIdentityIssues(
      {
        authorName: "Warix Build",
        authorEmail: WEAK_BUILD_GIT_AUTHOR_EMAIL,
        committerName: "Warix Build",
        committerEmail: WEAK_BUILD_GIT_AUTHOR_EMAIL,
      },
      { name: "Warix Build", email: WEAK_BUILD_GIT_AUTHOR_EMAIL },
    );
    assert.ok(issues.some((i) => /github-actions bot default/i.test(i)));
  });

  it("requires GitHub App + Vercel team token", () => {
    const issues = buildIdentityConfigIssues({
      githubAppConfigured: false,
      githubOrg: null,
      vercelTokenConfigured: false,
      vercelTeamIdConfigured: false,
    });
    assert.ok(issues.some((i) => /GitHub App/i.test(i)));
    assert.ok(issues.some((i) => /VERCEL_TOKEN/i.test(i)));
    assert.ok(issues.some((i) => /VERCEL_TEAM_ID/i.test(i)));
  });

  it("flags non-Warix App org", () => {
    const issues = buildIdentityConfigIssues({
      githubAppConfigured: true,
      githubOrg: "customer-org",
      vercelTokenConfigured: true,
      vercelTeamIdConfigured: true,
    });
    assert.ok(issues.some((i) => /Warix-AI/i.test(i)));
  });
});

describe("Phase 5 identity lock", () => {
  it("commit-draft does not accept author overrides", () => {
    const src = readFileSync(
      join(here, "../lib/build/git/commit-draft.ts"),
      "utf8",
    );
    assert.equal(/authorName\?:/.test(src), false);
    assert.equal(/authorEmail\?:/.test(src), false);
    assert.ok(src.includes("getBuildGitAuthor()"));
    assert.ok(/no per-call author overrides/i.test(src));
  });

  it("preflight imports identity checks", () => {
    const src = readFileSync(
      join(here, "../lib/build/publish/preflight.ts"),
      "utf8",
    );
    assert.ok(src.includes("tipCommitIdentityIssues"));
    assert.ok(src.includes("buildIdentityConfigIssues"));
  });
});
