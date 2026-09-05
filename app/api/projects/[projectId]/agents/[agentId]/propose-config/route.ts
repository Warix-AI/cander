/**
 * POST /api/projects/[projectId]/agents/[agentId]/propose-config
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectInWorkspace,
  assertWorkspaceMember,
  loadAgentBundle,
  proposeAgentConfigFromMessage,
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
  if (!(await assertProjectInWorkspace(projectId, workspaceId)).ok) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const bundle = await loadAgentBundle(agentId, workspaceId, projectId);
  if (!bundle) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  const proposal = proposeAgentConfigFromMessage(message, bundle);
  return NextResponse.json(proposal);
}
