/**
 * POST /api/projects/[projectId]/agents/[agentId]/duplicate
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectInWorkspace,
  assertWorkspaceMember,
  duplicateProjectAgent,
} from "@/lib/agents/server";

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

  let body: { workspaceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  if (!projectId || !agentId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId, agentId, and workspaceId are required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(await assertProjectInWorkspace(projectId, workspaceId)).ok) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const bundle = await duplicateProjectAgent({
      agentId,
      workspaceId,
      projectId,
      userId: auth.user.id,
    });
    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not duplicate agent.",
      },
      { status: 500 },
    );
  }
}
