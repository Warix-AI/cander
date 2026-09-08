import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCandidateChangeSet } from "@/lib/ai/intelligence/revisions";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";
import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
import { assertNoConcurrentBuild } from "@/lib/build/sandbox/lock";
import { sandboxWriteFile } from "@/lib/build/sandbox/files";
import { persistSandboxToDraft } from "@/lib/build/sandbox/persist";
import { safeRepoRelativePath } from "@/lib/build/git/commit-draft";

export const runtime = "nodejs";
export const maxDuration = 300;

type TaskFile = { path?: unknown; content?: unknown };

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: { taskId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const taskId = body.taskId?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("ai_tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const projectId = row.project_id ? String(row.project_id) : null;
  const workspaceId = row.workspace_id ? String(row.workspace_id) : null;
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "Task missing project/workspace." },
      { status: 400 },
    );
  }

  const { assertProjectAccess } = await import("@/lib/security/project-access");
  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.userId,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    await assertNoConcurrentBuild({
      projectId,
      workspaceId,
      exceptTaskId: taskId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `sandbox-build:${workspaceId}:${taskId}`;
  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_build",
    workspaceId,
    idempotencyKey,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { taskId, projectId },
  });
  if (!usage.ok) {
    return usage.response;
  }

  try {
    await admin
      .from("ai_tasks")
      .update({
        status: "running",
        progress_note: "Starting build environment…",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    const ensured = await ensureProjectSandbox({
      userId: auth.userId,
      projectId,
      workspaceId,
    });
    if (ensured.status !== "ready" || !ensured.sessionId) {
      throw new Error(
        ensured.message || `Build sandbox not ready (${ensured.status}).`,
      );
    }
    const sessionId = ensured.sessionId;

    // Lazy Supabase when task asks for auth/backend.
    const goalText = String(row.goal ?? row.title ?? "");
    const facts =
      row.facts && typeof row.facts === "object"
        ? (row.facts as Record<string, unknown>)
        : {};
    const wantsSupabase =
      facts.needSupabase === true ||
      facts.supabase === true ||
      /\b(auth|supabase|login|sign[- ]?up|rls)\b/i.test(goalText);
    if (wantsSupabase) {
      try {
        const { injectAppSupabaseIntoSandbox } = await import(
          "@/lib/build/supabase/inject"
        );
        await injectAppSupabaseIntoSandbox({
          userId: auth.userId,
          projectId,
          workspaceId,
          sessionId,
        });
      } catch (err) {
        console.warn("[cander] build-task supabase inject", err);
      }
    }

    // Apply explicit file writes from task.facts.files when present.
    const factFiles = Array.isArray(facts.files)
      ? (facts.files as TaskFile[])
      : [];
    let written = 0;
    for (const file of factFiles) {
      const path = typeof file.path === "string" ? file.path : "";
      if (!path) continue;
      const content = typeof file.content === "string" ? file.content : "";
      await sandboxWriteFile({
        userId: auth.userId,
        projectId,
        workspaceId,
        path: safeRepoRelativePath(path),
        content,
        persist: false,
      });
      written += 1;
    }

    // Optional install/build when package.json exists.
    const provider = getComputerProvider();
    let built = false;
    try {
      const pkg = await provider.readFile(sessionId, auth.userId, "package.json");
      if (pkg.trim()) {
        await admin
          .from("ai_tasks")
          .update({
            progress_note: "Installing dependencies…",
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId);
        const install = await provider.exec(sessionId, auth.userId, "npm", [
          "install",
        ]);
        if (install.exitCode === 0) {
          await admin
            .from("ai_tasks")
            .update({
              progress_note: "Running build…",
              updated_at: new Date().toISOString(),
            })
            .eq("id", taskId);
          const build = await provider.exec(sessionId, auth.userId, "npm", [
            "run",
            "build",
          ]);
          built = build.exitCode === 0;
        }
      }
    } catch {
      /* no package.json or build script — fine for sites */
    }

    await admin
      .from("ai_tasks")
      .update({
        status: "verifying",
        progress_note: "Saving draft to GitHub…",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    const goal = String(row.goal ?? row.title ?? "Draft update");
    const persisted = await persistSandboxToDraft({
      sessionId,
      userId: auth.userId,
      projectId,
      workspaceId,
      message: `Cander: ${goal}`.slice(0, 500),
    });

    if (persisted.draftSha && !persisted.noop) {
      const { recordGitCandidateChangeSet } = await import(
        "@/lib/build/git/revision-sync"
      );
      await recordGitCandidateChangeSet({
        projectId,
        workspaceId,
        draftSha: persisted.draftSha,
        summary: `Candidate change for “${String(row.title ?? "Work task")}”`,
        workerRunId: taskId,
      });
    } else {
      await createCandidateChangeSet({
        projectId,
        workspaceId,
        summary: `Candidate change for “${String(row.title ?? "Work task")}”`,
        workerRunId: taskId,
        gitSha: persisted.draftSha || null,
      });
    }

    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    const resultSummary = persisted.noop
      ? `Environment ready${written ? ` (${written} file writes)` : ""}${built ? "; build ok" : ""}. No new git changes to push.`
      : `Draft saved (${persisted.filesCommitted} file${persisted.filesCommitted === 1 ? "" : "s"}) → ${persisted.draftBranch}@${persisted.draftSha.slice(0, 7)}.`;

    return NextResponse.json({
      ok: true,
      sessionId,
      draftSha: persisted.draftSha || null,
      filesCommitted: persisted.filesCommitted,
      written,
      built,
      resultSummary,
    });
  } catch (err) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("ai_tasks")
      .update({
        status: "failed",
        progress_note: "That work didn’t finish. Tell me if you want to try again.",
        result_summary: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
