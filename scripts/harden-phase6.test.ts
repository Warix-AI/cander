/**
 * Phase 6 harden checklist — pure + source-contract tests (no live Vercel).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  publishIdempotencyKey,
  resolvePublishAttemptConflict,
  shouldReuseExistingPublishAttempt,
} from "../lib/build/publish/attempt-policy.ts";
import {
  canMarkBuildReady,
  draftTipSyncTouchesPublished,
  DRAFT_TIP_SYNC_PROJECT_KEYS,
} from "../lib/build/preview/ready-gates.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function indexOfOrThrow(src: string, needle: string, label: string): number {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `missing ${label}: ${needle.slice(0, 60)}`);
  return i;
}

describe("1. Dual-trigger — one Deploy API, zero Git auto-deploy", () => {
  it("disables createDeployments and clears ignore-build (never exit 0)", () => {
    const src = readSrc("lib/build/vercel/git-autodeploy.ts");
    assert.ok(src.includes('createDeployments: "disabled"'));
    assert.ok(src.includes("commandForIgnoringBuildStep: null"));
    // Body must not assign exit 0 (comment may mention it as forbidden).
    const bodyMatch = src.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/);
    assert.ok(bodyMatch);
    assert.equal(/exit 0/.test(bodyMatch![0]), false);
    assert.ok(/Do NOT set/.test(src));
  });

  it("publish disables git auto-deploy before Deploy API", () => {
    const src = readSrc("lib/build/publish/publish-project.ts");
    const disableIdx = indexOfOrThrow(
      src,
      "await disableGitAutoDeployments",
      "await disableGitAutoDeployments",
    );
    const preflightFail = indexOfOrThrow(src, "if (!preflight.ok)", "preflight fail");
    const deployIdx = indexOfOrThrow(
      src,
      "await createProductionDeployment",
      "await createProductionDeployment",
    );
    const promoteIdx = indexOfOrThrow(
      src,
      "await promoteDraftShaToDefaultBranch",
      "await promoteDraftShaToDefaultBranch",
    );
    assert.ok(disableIdx < deployIdx, "disable auto-deploy before Deploy API");
    assert.ok(preflightFail < deployIdx, "preflight fail before Deploy API");
    assert.ok(deployIdx < promoteIdx, "Deploy API before main promote");
  });
});

describe("2. Idempotency — same SHA reuses attempt", () => {
  it("idempotency key is stable and lowercases SHA", () => {
    assert.equal(
      publishIdempotencyKey("proj", "ABCDEF"),
      publishIdempotencyKey("proj", "abcdef"),
    );
    assert.equal(
      publishIdempotencyKey("proj", "abc"),
      "publish:proj:abc",
    );
  });

  it("conflict policy: failed reclaim; published/deploying reuse; null create", () => {
    assert.equal(resolvePublishAttemptConflict(null), "create");
    assert.equal(resolvePublishAttemptConflict("failed"), "reclaim");
    assert.equal(resolvePublishAttemptConflict("published"), "reuse");
    assert.equal(resolvePublishAttemptConflict("deploying"), "reuse");
    assert.equal(resolvePublishAttemptConflict("pending"), "reuse");
    assert.equal(shouldReuseExistingPublishAttempt("published"), true);
    assert.equal(shouldReuseExistingPublishAttempt("failed"), false);
  });

  it("Deploy API path forbids forceNew; POST is not retried", () => {
    const deploy = readSrc("lib/build/vercel/deployments.ts");
    assert.ok(deploy.includes("No forceNew"));
    assert.equal(/forceNew\s*:\s*true/.test(deploy), false);
    assert.ok(deploy.includes("refuses to retry this POST"));
    const api = readSrc("lib/build/vercel/api.ts");
    // Contract: Deploy POST path is special-cased or maxAttempts limited.
    assert.ok(
      /v13\/deployments/.test(api) ||
        /maxAttempts/.test(api) ||
        deploy.includes("refuses to retry"),
    );
  });
});

describe("3. Preflight fail blocks promote", () => {
  it("failed preflight returns prior published_sha and never reaches deploy", () => {
    const src = readSrc("lib/build/publish/publish-project.ts");
    const failBlockStart = indexOfOrThrow(src, "if (!preflight.ok)", "preflight");
    const deployAfter = indexOfOrThrow(
      src,
      "await createProductionDeployment",
      "await createProductionDeployment",
    );
    assert.ok(failBlockStart < deployAfter);
    const failSlice = src.slice(failBlockStart, deployAfter);
    assert.ok(failSlice.includes("return {"));
    assert.ok(failSlice.includes("published_sha") || failSlice.includes("publishedSha"));
    assert.ok(failSlice.includes('status: "failed"') || failSlice.includes('status: "error"'));
    assert.equal(failSlice.includes("await promoteDraftShaToDefaultBranch"), false);
  });
});

describe("4–5. Ready requires preview_check + SHA pin", () => {
  it("cannot ready without preview_check or on SHA mismatch", () => {
    assert.equal(
      canMarkBuildReady({
        projectDraftSha: "abc",
        sandboxDraftSha: "abc",
        previewCheckOk: false,
        phaseBeforeReady: "preview_check",
      }).ok,
      false,
    );
    assert.equal(
      canMarkBuildReady({
        projectDraftSha: "abc",
        sandboxDraftSha: "def",
        previewCheckOk: true,
        phaseBeforeReady: "preview_check",
      }).ok,
      false,
    );
    assert.equal(
      canMarkBuildReady({
        projectDraftSha: "abc",
        sandboxDraftSha: "abc",
        previewCheckOk: true,
        phaseBeforeReady: "implementing",
      }).ok,
      false,
    );
    assert.equal(
      canMarkBuildReady({
        projectDraftSha: "abc",
        sandboxDraftSha: "abc",
        previewCheckOk: true,
        phaseBeforeReady: "preview_check",
      }).ok,
      true,
    );
  });

  it("client website-setup cannot set ready; finalize uses ready gate", () => {
    const route = readSrc("app/api/projects/[projectId]/website-setup/route.ts");
    assert.ok(route.includes("Client cannot set status=ready") || route.includes("never sets ready"));
    assert.ok(route.includes('nextStatus = "building"') || route.includes("nextStatus = 'building'"));
    const finalize = readSrc("lib/build/preview/finalize-ready.ts");
    assert.ok(finalize.includes('phase: "preview_check"'));
    assert.ok(finalize.includes("canMarkBuildReady"));
    assert.ok(finalize.includes("allowServerReady: true"));
  });
});

describe("6. Edit after publish does not change published_sha", () => {
  it("draft tip sync keys never include published_*", () => {
    assert.equal(
      draftTipSyncTouchesPublished(DRAFT_TIP_SYNC_PROJECT_KEYS),
      false,
    );
    assert.equal(
      draftTipSyncTouchesPublished(["draft_sha", "published_sha"]),
      true,
    );
    const sync = readSrc("lib/build/git/revision-sync.ts");
    assert.equal(/published_sha/.test(sync), false);
    assert.ok(sync.includes("draft_sha"));
  });

  it("edit pipeline never publishes or touches published_sha", () => {
    const edit = readSrc("lib/ai/build/edit-pipeline.ts");
    assert.equal(/published_sha|publishProject|promoteDraftSha/.test(edit), false);
    assert.ok(edit.includes("persistProjectSandboxDraftClient"));
  });
});
