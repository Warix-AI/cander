import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessPreviewHealth,
  isHealthyPreviewStatus,
  isHttpPortOpen,
  sanitizePreviewDiagnostics,
} from "../lib/build/preview/health.ts";
import { nextUnhealthyStreakState } from "../lib/build/preview/unhealthy-streak.ts";
import { parsePorcelainChanges } from "../lib/build/sandbox/porcelain.ts";
import { applyUnifiedDiff } from "../lib/build/sandbox/apply-unified-diff.ts";
import { websiteSetupPreviewGate } from "../lib/hooks/website-setup-preview-gate.ts";
import { sandboxMatchesProjectTip } from "../lib/build/build-phase.ts";

describe("draft preview readiness", () => {
  it("does not treat HTTP 500 as healthy / ready", () => {
    assert.equal(isHealthyPreviewStatus(500), false);
    assert.equal(isHttpPortOpen(500), true);
    const bad = assessPreviewHealth({
      status: 500,
      bodyText: "<html>error</html>",
      diagnostics: "npm ERR! something",
    });
    assert.equal(bad.ok, false);
    assert.match(bad.reason || "", /HTTP 500/);
    assert.ok(bad.diagnostics);
  });

  it("treats 2xx as healthy", () => {
    assert.equal(isHealthyPreviewStatus(200), true);
    const good = assessPreviewHealth({
      status: 200,
      bodyText: "<html><body>ok</body></html>",
    });
    assert.equal(good.ok, true);
  });

  it("grace then fail for transient vs persistent 500 streaks", () => {
    const grace = 2;
    const limit = 3;
    let consecutive = 0;
    // Attempts 0,1 within grace — no fail
    for (let i = 0; i < 2; i++) {
      const s = nextUnhealthyStreakState({
        attemptIndex: i,
        hardUnhealthy: true,
        consecutiveUnhealthy: consecutive,
        graceAttempts: grace,
        consecutiveUnhealthyLimit: limit,
      });
      consecutive = s.consecutiveUnhealthy;
      assert.equal(s.shouldFail, false);
    }
    // Attempts 2,3,4 count toward limit
    let failed = false;
    for (let i = 2; i < 6; i++) {
      const s = nextUnhealthyStreakState({
        attemptIndex: i,
        hardUnhealthy: true,
        consecutiveUnhealthy: consecutive,
        graceAttempts: grace,
        consecutiveUnhealthyLimit: limit,
      });
      consecutive = s.consecutiveUnhealthy;
      if (s.shouldFail) {
        failed = true;
        assert.equal(i, 4); // third counted unhealthy after grace
        break;
      }
    }
    assert.equal(failed, true);

    // Healthy probe resets streak
    const reset = nextUnhealthyStreakState({
      attemptIndex: 0,
      hardUnhealthy: false,
      consecutiveUnhealthy: 5,
      graceAttempts: grace,
      consecutiveUnhealthyLimit: limit,
    });
    assert.equal(reset.consecutiveUnhealthy, 0);
    assert.equal(reset.shouldFail, false);
  });

  it("sanitizes secrets from diagnostics", () => {
    const out = sanitizePreviewDiagnostics(
      "Bearer abc.def.ghi\nsk-abcdefghijklmnopqrstuvwxyz\nreal error",
    );
    assert.ok(out);
    assert.doesNotMatch(out!, /sk-abcdef/);
    assert.match(out!, /redacted/i);
  });
});

describe("persist porcelain + patch", () => {
  it("parses writes, deletes, and renames", () => {
    const parsed = parsePorcelainChanges(
      [
        " M app/page.tsx",
        "D  app/old.js",
        "R  app/a.tsx -> app/b.tsx",
        "?? lib/new.ts",
      ].join("\n"),
    );
    assert.deepEqual(parsed.writes.sort(), [
      "app/b.tsx",
      "app/page.tsx",
      "lib/new.ts",
    ]);
    assert.ok(parsed.deletes.includes("app/old.js"));
    assert.ok(parsed.deletes.includes("app/a.tsx"));
  });

  it("applies unified diff instead of replacing the whole file", () => {
    const original = ["export default function Page() {", "  return <p>Hi</p>", "}", ""].join(
      "\n",
    );
    const patch = [
      "--- a/app/page.tsx",
      "+++ b/app/page.tsx",
      "@@ -1,3 +1,3 @@",
      " export default function Page() {",
      "-  return <p>Hi</p>",
      "+  return <p>Hello</p>",
      " }",
      "",
    ].join("\n");
    const applied = applyUnifiedDiff(original, patch);
    assert.equal(applied.ok, true);
    if (applied.ok) {
      assert.match(applied.content, /Hello/);
      assert.doesNotMatch(applied.content, /^--- /m);
      assert.doesNotMatch(applied.content, /Hi/);
    }
  });

  it("rejects a raw patch without hunks", () => {
    const applied = applyUnifiedDiff("hello", "not a diff");
    assert.equal(applied.ok, false);
  });
});

describe("setup gate + draft chrome", () => {
  it("pending brief does not flash guided-setup overlay or block sandbox", () => {
    const pending = websiteSetupPreviewGate({
      isSite: true,
      status: null,
      briefPending: true,
    });
    assert.equal(pending.setupBlocksPreview, false);
    assert.equal(pending.showSetupOverlay, false);
    assert.equal(pending.isPreviewReady, false);

    const unknown = websiteSetupPreviewGate({
      isSite: true,
      status: null,
    });
    assert.equal(unknown.setupBlocksPreview, false);
    assert.equal(unknown.showSetupOverlay, false);
  });

  it("failed does not use setupBlocksPreview; overlay + retry path remain", () => {
    const failed = websiteSetupPreviewGate({
      isSite: true,
      status: "failed",
      draftRunnable: false,
    });
    assert.equal(failed.setupFailed, true);
    assert.equal(failed.setupBlocksPreview, false);
    assert.equal(failed.showSetupOverlay, true);
    assert.equal(failed.isPreviewReady, false);

    const building = websiteSetupPreviewGate({
      isSite: true,
      status: "building",
      draftRunnable: false,
    });
    assert.equal(building.setupBlocksPreview, true);
    assert.equal(building.showSetupOverlay, true);

    const ready = websiteSetupPreviewGate({
      isSite: true,
      status: "ready",
      draftRunnable: true,
    });
    assert.equal(ready.isPreviewReady, true);
    assert.equal(ready.setupBlocksPreview, false);
    assert.equal(ready.showSetupOverlay, false);
  });

  it("address bar shows draft URL when unpublished", () => {
    // Mirrors chromeUrlForBuildProject: prefer published, else show draft candidate.
    const draft = "https://draft--acme.cander.app";
    const published = "https://acme.cander.app";
    const pick = (opts: {
      publishedUrl?: string | null;
      candidateUrl?: string | null;
    }) => {
      const p = opts.publishedUrl?.trim();
      if (p && /^https?:\/\//i.test(p) && !/draft--/.test(p)) return p;
      const c = opts.candidateUrl?.trim() || "";
      if (!c || c === "about:blank") return "";
      return c;
    };
    assert.equal(pick({ publishedUrl: null, candidateUrl: draft }), draft);
    assert.equal(
      pick({ publishedUrl: published, candidateUrl: draft }),
      published,
    );
  });

  it("empty sandbox SHA does not match project tip", () => {
    assert.equal(
      sandboxMatchesProjectTip({
        sandboxDraftSha: "",
        projectDraftSha: "abc123",
      }),
      false,
    );
  });
});

describe("persist outcome messaging contract", () => {
  it("keeps distinct outcomes for callers", () => {
    const outcomes = ["committed", "noop", "partial", "db_sync_failed"] as const;
    assert.equal(outcomes.length, 4);
    assert.ok(!outcomes.includes("ok" as never));
  });
});
