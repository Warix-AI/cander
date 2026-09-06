/**
 * GET/POST /api/projects/[projectId]/agents
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectInWorkspace,
  assertWorkspaceMember,
  countProjectAgentRunsSince,
  createProjectAgent,
  ensureDefaultAgent,
  listProjectAgents,
} from "@/lib/agents/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId: rawId } = await context.params;
  const projectId = rawId?.trim();
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
      { status: 400 },
    );
  }

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const project = await assertProjectInWorkspace(projectId, workspaceId);
  if (!project.ok) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let agents = await listProjectAgents(workspaceId, projectId);
  if (!agents.length) {
    const created = await ensureDefaultAgent({
      workspaceId,
      projectId,
      userId: auth.user.id,
    });
    agents = [created];
  }
  const since = new Date();
  since.setDate(since.getDate() - 7);
  let runsLast7d = 0;
  try {
    runsLast7d = await countProjectAgentRunsSince({
      workspaceId,
      projectId,
      sinceIso: since.toISOString(),
    });
  } catch {
    runsLast7d = 0;
  }
  return NextResponse.json({ agents, runsLast7d });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId: rawId } = await context.params;
  const projectId = rawId?.trim();
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    workspaceId?: string;
    name?: string;
    description?: string;
    instructions?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const project = await assertProjectInWorkspace(projectId, workspaceId);
  if (!project.ok) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const agent = await createProjectAgent({
      workspaceId,
      projectId,
      userId: auth.user.id,
      name: body.name?.trim() || "Agent",
      description: body.description,
      instructions: body.instructions,
    });
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create agent.",
      },
      { status: 500 },
    );
  }
}
