/**
 * PATCH /api/projects/[projectId]/agents/[agentId]/config
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import type { AgentConfigPatch } from "@/lib/agents/types";
import {
  applyAgentConfigPatch,
  assertProjectAccessForUser,
  assertWorkspaceMember,
} from "@/lib/agents/server";

export const runtime = "nodejs";

function patchNeedsConfirmation(patch: AgentConfigPatch): boolean {
  return Boolean(
    patch.setToolPermissions?.length ||
      patch.setConnectorEnabled?.length ||
      patch.addKnowledge?.length ||
      patch.removeKnowledgeIds?.length ||
      patch.deleteRouteIds?.length ||
      patch.upsertRoutes?.length,
  );
}

export async function PATCH(
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

  let body: {
    workspaceId?: string;
    patch?: AgentConfigPatch;
    confirmed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  const patch = body.patch;
  if (!projectId || !agentId || !workspaceId || !patch) {
    return NextResponse.json(
      { error: "workspaceId and patch are required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(await assertProjectAccessForUser(projectId, workspaceId, auth.user.id)).ok) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (patchNeedsConfirmation(patch) && !body.confirmed) {
    return NextResponse.json(
      {
        error: "Confirmation required for this config change.",
        requiresConfirmation: true,
      },
      { status: 409 },
    );
  }

  try {
    const bundle = await applyAgentConfigPatch({
      agentId,
      workspaceId,
      projectId,
      patch,
    });
    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not apply config.",
      },
      { status: 500 },
    );
  }
}
