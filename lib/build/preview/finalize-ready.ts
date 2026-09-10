/**
 * Server-only: mark Website Build ready after tip SHA pin + preview_check.
 * Client cannot call setProjectBuildPhase(ready) — only this path.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  setProjectBuildPhase,
  sandboxMatchesProjectTip,
} from "@/lib/build/build-phase";
import { draftTipHasNextPackage } from "@/lib/build/git/draft-tip";
import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
import { getComputerSessionRowById } from "@/lib/computer/session-store";
import { runSandboxPreviewCheck } from "@/lib/build/preview/preview-check";
import {
  loadWebsiteSetupBrief,
  saveWebsiteSetupBrief,
} from "@/lib/build/website-setup-brief-store";

export type FinalizeBuildReadyResult = {
  ok: boolean;
  phase: string;
  draftSha: string | null;
  sessionId: string | null;
  reason?: string;
  previewStatus?: number | null;
};

export async function finalizeBuildReady(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
}): Promise<FinalizeBuildReadyResult> {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("draft_sha, sandbox_session_id, kind")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  const draftSha = project?.draft_sha ? String(project.draft_sha) : null;
  if (!draftSha) {
    await setProjectBuildPhase({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      phase: "failed",
    });
    return {
      ok: false,
      phase: "failed",
      draftSha: null,
      sessionId: null,
      reason: "No draft tip SHA — finish writing the site before ready.",
    };
  }

  const runnable = await draftTipHasNextPackage({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
  });
  if (!runnable) {
    await setProjectBuildPhase({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      phase: "failed",
    });
    return {
      ok: false,
      phase: "failed",
      draftSha,
      sessionId: null,
      reason: "Draft tip is not a runnable Next.js app (missing package.json / next).",
    };
  }

  await setProjectBuildPhase({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    phase: "booting",
  });

  let sandbox = await ensureProjectSandbox({
    userId: opts.userId,
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    forceRestart: false,
  });

  if (sandbox.status === "error" || !sandbox.sessionId) {
    await setProjectBuildPhase({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      phase: "failed",
    });
    return {
      ok: false,
      phase: "failed",
      draftSha,
      sessionId: null,
      reason: sandbox.message || "Sandbox failed to boot.",
    };
  }

  // SHA pin: refuse ready when sandbox tip ≠ project tip.
  const row = await getComputerSessionRowById(sandbox.sessionId);
  const sandboxSha =
    row?.build_state && typeof row.build_state === "object"
      ? String((row.build_state as { draftSha?: string }).draftSha || "")
      : String(sandbox.draftSha || "");

  if (
    !sandboxMatchesProjectTip({
      sandboxDraftSha: sandboxSha || sandbox.draftSha,
      projectDraftSha: draftSha,
    })
  ) {
    console.info("[cander:build-ready] SHA mismatch; force recreating sandbox", {
      projectId: opts.projectId,
      sandboxSha: (sandboxSha || "").slice(0, 12),
      tipSha: draftSha.slice(0, 12),
    });
    sandbox = await ensureProjectSandbox({
      userId: opts.userId,
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      forceRestart: true,
    });
    if (sandbox.status === "error" || !sandbox.sessionId) {
      await setProjectBuildPhase({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        phase: "failed",
      });
      return {
        ok: false,
        phase: "failed",
        draftSha,
        sessionId: null,
        reason: sandbox.message || "Sandbox recreate after SHA mismatch failed.",
      };
    }
    const row2 = await getComputerSessionRowById(sandbox.sessionId);
    const sandboxSha2 =
      row2?.build_state && typeof row2.build_state === "object"
        ? String((row2.build_state as { draftSha?: string }).draftSha || "")
        : String(sandbox.draftSha || "");
    if (
      !sandboxMatchesProjectTip({
        sandboxDraftSha: sandboxSha2 || sandbox.draftSha,
        projectDraftSha: draftSha,
      })
    ) {
      await setProjectBuildPhase({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        phase: "failed",
      });
      return {
        ok: false,
        phase: "failed",
        draftSha,
        sessionId: sandbox.sessionId,
        reason: `Sandbox tip SHA does not match project draft_sha (${draftSha.slice(0, 7)}).`,
      };
    }
  }

  await setProjectBuildPhase({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    phase: "preview_check",
  });

  const health = await runSandboxPreviewCheck({
    sessionId: sandbox.sessionId,
    userId: opts.userId,
  });

  if (!health.ok) {
    await setProjectBuildPhase({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      phase: "failed",
    });
    const brief = await loadWebsiteSetupBrief(opts.projectId, opts.workspaceId);
    await saveWebsiteSetupBrief({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      brief: {
        ...brief,
        status: "failed",
        validationIssues: [
          health.reason || "Preview health check failed.",
        ],
        updatedAt: new Date().toISOString(),
      },
      allowServerReady: false,
    });
    return {
      ok: false,
      phase: "failed",
      draftSha,
      sessionId: sandbox.sessionId,
      reason: health.reason || "Preview health check failed.",
      previewStatus: health.status,
    };
  }

  await setProjectBuildPhase({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    phase: "ready",
  });

  const brief = await loadWebsiteSetupBrief(opts.projectId, opts.workspaceId);
  await saveWebsiteSetupBrief({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    brief: {
      ...brief,
      status: "ready",
      validationIssues: [],
      updatedAt: new Date().toISOString(),
    },
    allowServerReady: true,
  });

  console.info("[cander:build-ready] ready", {
    projectId: opts.projectId,
    draftSha: draftSha.slice(0, 12),
    sessionId: sandbox.sessionId,
    previewAttempts: health.attempts,
  });

  return {
    ok: true,
    phase: "ready",
    draftSha,
    sessionId: sandbox.sessionId,
    previewStatus: health.status,
  };
}
