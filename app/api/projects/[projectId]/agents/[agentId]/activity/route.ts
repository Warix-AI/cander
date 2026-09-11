/**
 * GET/POST /api/projects/[projectId]/agents/[agentId]/activity
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { handleActivityUserMessage } from "@/lib/agents/approvals";
import {
  assertProjectAccessForUser,
  assertWorkspaceMember,
  listAgentActivity,
} from "@/lib/agents/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; agentId: string }> },
) {
  const { projectId: rawProjectId, agentId: rawAgentId } = await context.params;
  const projectId = rawProjectId?.trim();
  const agentId = rawAgentId?.trim();
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  if (!projectId || !agentId || !workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (
    !(await assertProjectAccessForUser(projectId, workspaceId, auth.user.id)).ok
  ) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const activity = await listAgentActivity({
      agentId,
      workspaceId,
      limit: 40,
    });
    return NextResponse.json(activity);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; agentId: string }> },
) {
  const { projectId: rawProjectId, agentId: rawAgentId } = await context.params;
  const projectId = rawProjectId?.trim();
  const agentId = rawAgentId?.trim();
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { workspaceId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  const message = body.message?.trim();
  if (!projectId || !agentId || !workspaceId || !message) {
    return NextResponse.json(
      { error: "workspaceId and message are required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (
    !(await assertProjectAccessForUser(projectId, workspaceId, auth.user.id)).ok
  ) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const result = await handleActivityUserMessage({
      workspaceId,
      projectId,
      agentId,
      profileId: auth.user.id,
      message,
    });
    const activity = await listAgentActivity({ agentId, workspaceId });
    return NextResponse.json({ ...result, ...activity });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ error: messageText }, { status: 400 });
  }
}
