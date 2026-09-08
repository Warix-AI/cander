/**
 * POST /api/projects/[projectId]/agents/[agentId]/run
 * Manual Agent run — creates AgentRun first, then executes.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectAccessForUser,
  assertWorkspaceMember,
} from "@/lib/agents/server";
import { runAgent } from "@/lib/agents/runtime";

export const runtime = "nodejs";

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
  if (!projectId || !agentId || !workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(await assertProjectAccessForUser(projectId, workspaceId, auth.user.id)).ok) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const result = await runAgent({
      agentId,
      workspaceId,
      projectId,
      profileId: auth.user.id,
      triggerType: "manual",
      message: body.message,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Run failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
