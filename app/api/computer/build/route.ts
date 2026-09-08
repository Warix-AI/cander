import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCandidateChangeSet } from "@/lib/ai/intelligence/revisions";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    return NextResponse.json({ error: "Task missing project/workspace." }, { status: 400 });
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
    const { ensureProjectSandbox } = await import(
      "@/lib/build/sandbox/lifecycle"
    );
    const ensured = await ensureProjectSandbox({
      userId: auth.userId,
      projectId,
      workspaceId,
    });
    if (ensured.status !== "ready" || !ensured.sessionId) {
      throw new Error(
        ensured.message ||
          `Build sandbox not ready (${ensured.status}).`,
      );
    }

    const provider = getComputerProvider();
    const sessionId = ensured.sessionId;

    // Prefer git-cloned tree; fall back to legacy project_files restore.
    let fileCount = 0;
    try {
      const restored = await provider.restoreProject(
        sessionId,
        auth.userId,
        projectId,
        { workspaceId },
      );
      fileCount = restored.fileCount;
    } catch {
      fileCount = 0;
    }

    const install = await provider.exec(sessionId, auth.userId, "npm", [
      "install",
    ]);
    if (install.exitCode !== 0) {
      throw new Error(install.stderr || "npm install failed.");
    }

    await provider.exec(sessionId, auth.userId, "npm", ["run", "build"]);

    await createCandidateChangeSet({
      projectId,
      workspaceId,
      summary: `Candidate change for “${String(row.title ?? "Work task")}”`,
      workerRunId: taskId,
    });

    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      fileCount,
      resultSummary: `Build finished in sandbox session ${sessionId}.`,
    });
  } catch (err) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
