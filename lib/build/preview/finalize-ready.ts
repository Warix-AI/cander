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
import { repairProjectRuntime } from "@/lib/build/sandbox/runtime";
import { getComputerSessionRowById } from "@/lib/computer/session-store";
import { runSandboxPreviewCheck } from "@/lib/build/preview/preview-check";
import {
  loadWebsiteSetupBrief,
  saveWebsiteSetupBrief,
} from "@/lib/build/website-setup-brief-store";
import { canMarkBuildReady } from "@/lib/build/preview/ready-gates";

export type FinalizeBuildReadyResult = {
  ok: boolean;
  phase: string;
  draftSha: string | null;
  sessionId: string | null;
  reason?: string;
  previewStatus?: number | null;
  /** Sanitized install / Next logs when preview is unhealthy. */
  diagnostics?: string | null;
  /** True when an automatic recreate/heal pass ran this call. */
  healAttempted?: boolean;
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

  let draftSha = project?.draft_sha ? String(project.draft_sha) : null;
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

  let runnable = await draftTipHasNextPackage({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
  });
  if (!runnable) {
    try {
      const { ensureDraftSitePackageJson } = await import(
        "@/lib/build/git/ensure-site-package"
      );
      const ensured = await ensureDraftSitePackageJson({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
      });
      if (ensured.draftSha) draftSha = ensured.draftSha;
    } catch (err) {
      console.warn("[cander:build-ready] ensure runnable scaffold failed", err);
    }
    runnable = await draftTipHasNextPackage({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
  }
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
    console.info("[cander:build-ready] SHA mismatch; repairing sandbox", {
      projectId: opts.projectId,
      sandboxSha: (sandboxSha || "").slice(0, 12),
      tipSha: draftSha.slice(0, 12),
    });
    // Repair fast-forwards the VM to the tip and only recreates if it is dead.
    sandbox = await repairProjectRuntime({
      userId: opts.userId,
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
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

  let health = await runSandboxPreviewCheck({
    sessionId: sandbox.sessionId,
    userId: opts.userId,
  });

  if (!health.ok) {
    // One automatic heal: ensure core App Router files, recreate sandbox, re-check.
    const healAttempted = true;
    console.info("[cander:build-ready] preview unhealthy; auto-healing once", {
      projectId: opts.projectId,
      reason: health.reason,
      status: health.status,
    });
    try {
      const { ensureDraftSitePackageJson } = await import(
        "@/lib/build/git/ensure-site-package"
      );
      const ensured = await ensureDraftSitePackageJson({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
      });
      if (ensured.draftSha) draftSha = ensured.draftSha;
    } catch (err) {
      console.warn("[cander:build-ready] heal ensure failed", err);
    }

    const healedSandbox = await repairProjectRuntime({
      userId: opts.userId,
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    const healedSessionId = healedSandbox.sessionId;
    if (healedSandbox.status !== "error" && healedSessionId) {
      sandbox = healedSandbox;
      health = await runSandboxPreviewCheck({
        sessionId: healedSessionId,
        userId: opts.userId,
      });
      if (health.ok) {
        const { data: project2 } = await admin
          .from("projects")
          .select("draft_sha")
          .eq("id", opts.projectId)
          .eq("workspace_id", opts.workspaceId)
          .maybeSingle();
        const healedSha = project2?.draft_sha
          ? String(project2.draft_sha)
          : draftSha;
        await setProjectBuildPhase({
          projectId: opts.projectId,
          workspaceId: opts.workspaceId,
          phase: "preview_check",
        });
        const gate = canMarkBuildReady({
          projectDraftSha: healedSha,
          sandboxDraftSha: sandbox.draftSha,
          previewCheckOk: true,
          phaseBeforeReady: "preview_check",
        });
        if (gate.ok) {
          await setProjectBuildPhase({
            projectId: opts.projectId,
            workspaceId: opts.workspaceId,
            phase: "ready",
          });
          const brief = await loadWebsiteSetupBrief(
            opts.projectId,
            opts.workspaceId,
          );
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
          return {
            ok: true,
            phase: "ready",
            draftSha: healedSha,
            sessionId: healedSessionId,
            previewStatus: health.status,
            healAttempted,
          };
        }
      }
    }

    await setProjectBuildPhase({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      phase: "failed",
    });
    const failReason = health.reason || "Preview health check failed.";
    const diagnostics = health.diagnostics || null;
    const brief = await loadWebsiteSetupBrief(opts.projectId, opts.workspaceId);
    await saveWebsiteSetupBrief({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      brief: {
        ...brief,
        status: "failed",
        validationIssues: [
          failReason,
          ...(diagnostics ? [diagnostics] : []),
        ].slice(0, 3),
        updatedAt: new Date().toISOString(),
      },
      allowServerReady: false,
    });
    return {
      ok: false,
      phase: "failed",
      draftSha,
      sessionId: sandbox.sessionId,
      reason: failReason,
      previewStatus: health.status,
      diagnostics,
      healAttempted,
    };
  }

  const gate = canMarkBuildReady({
    projectDraftSha: draftSha,
    sandboxDraftSha: sandbox.draftSha,
    previewCheckOk: true,
    phaseBeforeReady: "preview_check",
  });
  if (!gate.ok) {
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
      reason: gate.reason || "Ready gate failed.",
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
