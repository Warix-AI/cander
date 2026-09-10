/**
 * POST /api/projects/[projectId]/sandbox/files
 * AI / Build file ops against the project sandbox (authz + path-safe).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import {
  sandboxExecAllowed,
  sandboxListFiles,
  sandboxReadFile,
  sandboxWriteFile,
  ensureBuildSandboxSession,
} from "@/lib/build/sandbox/files";
import { persistSandboxToDraft } from "@/lib/build/sandbox/persist";

export const runtime = "nodejs";
export const maxDuration = 180;

type RouteCtx = { params: Promise<{ projectId: string }> };

type Body = {
  workspaceId?: string;
  action?: "read" | "write" | "list" | "exec" | "persist";
  path?: string;
  content?: string;
  command?: string;
  args?: string[];
  persist?: boolean;
  message?: string;
};

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const action = body.action;
  if (!projectId || !workspaceId || !action) {
    return NextResponse.json(
      { error: "projectId, workspaceId, and action are required." },
      { status: 400 },
    );
  }

  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    if (action === "write") {
      if (!body.path) {
        return NextResponse.json({ error: "path required." }, { status: 400 });
      }
      const result = await sandboxWriteFile({
        userId: auth.user.id,
        projectId,
        workspaceId,
        path: body.path,
        content: body.content ?? "",
        persist: Boolean(body.persist),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "read") {
      if (!body.path) {
        return NextResponse.json({ error: "path required." }, { status: 400 });
      }
      const result = await sandboxReadFile({
        userId: auth.user.id,
        projectId,
        workspaceId,
        path: body.path,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "list") {
      const result = await sandboxListFiles({
        userId: auth.user.id,
        projectId,
        workspaceId,
        path: body.path,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "exec") {
      if (!body.command?.trim()) {
        return NextResponse.json(
          { error: "command required." },
          { status: 400 },
        );
      }
      const result = await sandboxExecAllowed({
        userId: auth.user.id,
        projectId,
        workspaceId,
        command: body.command,
        args: body.args,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "persist") {
      const { sessionId } = await ensureBuildSandboxSession({
        userId: auth.user.id,
        projectId,
        workspaceId,
      });
      const result = await persistSandboxToDraft({
        sessionId,
        userId: auth.user.id,
        projectId,
        workspaceId,
        message:
          body.message?.trim() ||
          "Cander: persist draft from sandbox",
      });
      const ok = result.outcome !== "db_sync_failed";
      return NextResponse.json(
        { ok, sessionId, ...result },
        { status: ok ? 200 : 409 },
      );
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
