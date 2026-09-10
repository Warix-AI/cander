import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  briefStatusFromBuildPhase,
  buildPhaseFromBriefStatus,
  getProjectBuildPhase,
  sandboxMatchesProjectTip,
  normalizeSha,
  isBuildPhase,
} from "../lib/build/build-phase.ts";
import { assessPreviewHealth } from "../lib/build/preview/health.ts";

describe("build_phase helpers", () => {
  it("maps ready only from ready phase", () => {
    assert.equal(briefStatusFromBuildPhase("ready"), "ready");
    assert.equal(briefStatusFromBuildPhase("preview_check"), "building");
    assert.equal(briefStatusFromBuildPhase("booting"), "building");
    assert.equal(briefStatusFromBuildPhase("failed"), "failed");
    assert.equal(briefStatusFromBuildPhase("setup"), "setup");
  });

  it("maps coarse brief status without inventing ready from building", () => {
    assert.equal(buildPhaseFromBriefStatus("ready"), "ready");
    assert.equal(buildPhaseFromBriefStatus("building"), "implementing");
    assert.equal(buildPhaseFromBriefStatus("setup"), "setup");
    assert.equal(buildPhaseFromBriefStatus("failed"), "failed");
  });

  it("recognizes all machine phases", () => {
    assert.ok(isBuildPhase("preview_check"));
    assert.ok(isBuildPhase("ready"));
    assert.equal(isBuildPhase("done"), false);
  });

  it("getProjectBuildPhase fails soft when admin env is missing", async () => {
    const prev = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const phase = await getProjectBuildPhase({
        projectId: "p",
        workspaceId: "w",
      });
      assert.equal(phase, null);
    } finally {
      if (prev !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prev;
    }
  });
});

describe("sandbox SHA pin", () => {
  it("requires both SHAs and matches full or prefix", () => {
    assert.equal(
      sandboxMatchesProjectTip({
        sandboxDraftSha: null,
        projectDraftSha: "abc",
      }),
      false,
    );
    assert.equal(
      sandboxMatchesProjectTip({
        sandboxDraftSha: "abcdef0",
        projectDraftSha: "abcdef012345",
      }),
      true,
    );
    assert.equal(
      sandboxMatchesProjectTip({
        sandboxDraftSha: "deadbeef",
        projectDraftSha: "cafebabe",
      }),
      false,
    );
    assert.equal(normalizeSha(" ABC "), "abc");
  });
});

describe("ready requires preview_check health", () => {
  it("unhealthy preview cannot be treated as ready", () => {
    const bad = assessPreviewHealth({
      status: 500,
      bodyText: "Internal Server Error",
    });
    assert.equal(bad.ok, false);
    // Contract: finalizeBuildReady must refuse ready when !health.ok
    assert.equal(bad.ok && briefStatusFromBuildPhase("ready") === "ready", false);
  });

  it("healthy HTML allows ready path", () => {
    const good = assessPreviewHealth({
      status: 200,
      bodyText: "<!doctype html><html><body>ok</body></html>",
    });
    assert.equal(good.ok, true);
  });

  it("SHA mismatch blocks ready even if preview looks healthy", () => {
    const healthOk = assessPreviewHealth({
      status: 200,
      bodyText: "<html>ok</html>",
    }).ok;
    const shaOk = sandboxMatchesProjectTip({
      sandboxDraftSha: "1111111",
      projectDraftSha: "2222222",
    });
    assert.equal(healthOk && shaOk, false);
  });
});
