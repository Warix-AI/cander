/**
 * GET/PATCH/DELETE /api/projects/[projectId]/agents/[agentId]
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectAccessForUser,
  assertWorkspaceMember,
  deleteProjectAgent,
  loadAgentBundle,
  updateProjectAgent,
} from "@/lib/agents/server";

export const runtime = "nodejs";

async function authorize(
  request: Request,
  projectId: string,
  workspaceId: string | null,
) {
  if (!projectId || !workspaceId) {
    return {
      error: NextResponse.json(
        { error: "projectId and workspaceId are required." },
        { status: 400 },
      ),
    };
  }
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return {
      error: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  const project = await assertProjectAccessForUser(projectId, workspaceId, auth.user.id);
  if (!project.ok) {
    return {
      error: NextResponse.json({ error: "Project not found." }, { status: 404 }),
    };
  }
  return { auth, workspaceId };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; agentId: string }> },
) {
  const { projectId: rawProjectId, agentId: rawAgentId } = await context.params;
  const projectId = rawProjectId?.trim();
  const agentId = rawAgentId?.trim();
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim() ?? null;
  const gate = await authorize(request, projectId, workspaceId);
  if ("error" in gate && gate.error) return gate.error;

  const bundle = await loadAgentBundle(
    agentId,
    gate.workspaceId!,
    projectId,
    { profileId: gate.auth!.user.id },
  );
  if (!bundle) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  return NextResponse.json(bundle);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; agentId: string }> },
) {
  const { projectId: rawProjectId, agentId: rawAgentId } = await context.params;
  const projectId = rawProjectId?.trim();
  const agentId = rawAgentId?.trim();

  let body: {
    workspaceId?: string;
    name?: string;
    description?: string;
    instructions?: string;
    enabled?: boolean;
    status?: "draft" | "active" | "paused";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const gate = await authorize(
    request,
    projectId,
    body.workspaceId?.trim() ?? null,
  );
  if ("error" in gate && gate.error) return gate.error;

  try {
    const agent = await updateProjectAgent(
      agentId,
      gate.workspaceId!,
      projectId,
      {
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        enabled: body.enabled,
        status: body.status,
      },
    );
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update agent.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; agentId: string }> },
) {
  const { projectId: rawProjectId, agentId: rawAgentId } = await context.params;
  const projectId = rawProjectId?.trim();
  const agentId = rawAgentId?.trim();
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim() ?? null;
  const gate = await authorize(request, projectId, workspaceId);
  if ("error" in gate && gate.error) return gate.error;

  try {
    await deleteProjectAgent(agentId, gate.workspaceId!, projectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete agent.",
      },
      { status: 500 },
    );
  }
}
