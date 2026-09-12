/**
 * GET/PUT /api/projects/[projectId]/agents/[agentId]/scope
 * Lightweight connection allowlist for Cander when acting for this Agent.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectAccessForUser,
  assertWorkspaceMember,
  getProjectAgent,
  listAgentConnectorScopes,
  loadAgentBundle,
  setAgentConnectorScopes,
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

  const agent = await getProjectAgent(agentId, workspaceId, projectId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  const scope = await listAgentConnectorScopes({
    agentId,
    workspaceId,
    profileId: auth.user.id,
  });
  return NextResponse.json({ scope });
}

export async function PUT(
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

  let body: { workspaceId?: string; connectionIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  if (!projectId || !agentId || !workspaceId || !Array.isArray(body.connectionIds)) {
    return NextResponse.json(
      { error: "workspaceId and connectionIds[] are required." },
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
    const scope = await setAgentConnectorScopes({
      agentId,
      workspaceId,
      projectId,
      profileId: auth.user.id,
      connectionIds: body.connectionIds,
    });
    const bundle = await loadAgentBundle(agentId, workspaceId, projectId, {
      profileId: auth.user.id,
    });
    return NextResponse.json({ scope, agent: bundle?.agent ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update scope." },
      { status: 400 },
    );
  }
}
