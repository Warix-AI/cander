import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coalesceEnsureProjectSandbox } from "../lib/build/sandbox/ensure-coalesce.ts";
import { BUILD_RETRY_BUDGETS } from "../lib/ai/build/retry-budgets.ts";
import type { EnsureProjectSandboxResult } from "../lib/build/sandbox/lifecycle.ts";

function fakeResult(
  status: EnsureProjectSandboxResult["status"] = "ready",
): EnsureProjectSandboxResult {
  return {
    projectId: "p1",
    workspaceId: "w1",
    status,
    sessionId: "s1",
    subdomain: null,
    draftBranch: "cander/draft",
    draftSha: "abc",
    githubFullName: "org/repo",
    hasPreviewUpstream: false,
    previewPath: null,
    reused: false,
  };
}

describe("BUILD_RETRY_BUDGETS", () => {
  it("locks phase-0 sandbox/publish caps", () => {
    assert.equal(BUILD_RETRY_BUDGETS.sandboxForceRestart, 1);
    assert.equal(BUILD_RETRY_BUDGETS.publishEnsureProject, 1);
    assert.equal(BUILD_RETRY_BUDGETS.publishDeploy, 1);
  });
});

describe("coalesceEnsureProjectSandbox", () => {
  it("joins concurrent non-restart callers into one run", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
      return fakeResult();
    };
    const [a, b, c] = await Promise.all([
      coalesceEnsureProjectSandbox({
        projectId: "coalesce-a",
        workspaceId: "ws",
        forceRestart: false,
        run,
      }),
      coalesceEnsureProjectSandbox({
        projectId: "coalesce-a",
        workspaceId: "ws",
        forceRestart: false,
        run,
      }),
      coalesceEnsureProjectSandbox({
        projectId: "coalesce-a",
        workspaceId: "ws",
        forceRestart: false,
        run,
      }),
    ]);
    assert.equal(runs, 1);
    assert.equal(a.sessionId, "s1");
    assert.equal(b.sessionId, a.sessionId);
    assert.equal(c.sessionId, a.sessionId);
  });

  it("lets a restart wait for an in-flight restart", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 15));
      return fakeResult();
    };
    const p1 = coalesceEnsureProjectSandbox({
      projectId: "coalesce-b",
      workspaceId: "ws",
      forceRestart: true,
      run,
    });
    const p2 = coalesceEnsureProjectSandbox({
      projectId: "coalesce-b",
      workspaceId: "ws",
      forceRestart: true,
      run,
    });
    await Promise.all([p1, p2]);
    assert.equal(runs, 1);
  });

  it("starts a restart when only a non-restart is in flight", async () => {
    let runs = 0;
    const statuses: Array<"starting" | "ready"> = [];
    const run = async () => {
      const n = ++runs;
      statuses.push(n === 1 ? "starting" : "ready");
      await new Promise((r) => setTimeout(r, 25));
      return fakeResult(n === 1 ? "starting" : "ready");
    };
    const p1 = coalesceEnsureProjectSandbox({
      projectId: "coalesce-c",
      workspaceId: "ws",
      forceRestart: false,
      run,
    });
    await new Promise((r) => setTimeout(r, 5));
    const p2 = coalesceEnsureProjectSandbox({
      projectId: "coalesce-c",
      workspaceId: "ws",
      forceRestart: true,
      run,
    });
    const [a, b] = await Promise.all([p1, p2]);
    assert.equal(runs, 2);
    assert.deepEqual(statuses, ["starting", "ready"]);
    assert.equal(a.status, "starting");
    assert.equal(b.status, "ready");
  });
});
