/**
 * POST /api/projects/[projectId]/agents/[agentId]/approve
 * Approve or reject a waiting Expert run that paused for confirmation.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectAccessForUser,
  assertWorkspaceMember,
} from "@/lib/agents/server";
import { resumeAgentAfterApproval } from "@/lib/agents/runtime";

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

  let body: {
    workspaceId?: string;
    runId?: string;
    decision?: "approve" | "reject";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  const runId = body.runId?.trim();
  const decision = body.decision;
  if (!projectId || !agentId || !workspaceId || !runId) {
    return NextResponse.json(
      { error: "workspaceId and runId are required." },
      { status: 400 },
    );
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { error: "decision must be approve or reject." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (
    !(await assertProjectAccessForUser(projectId, workspaceId, auth.user.id))
      .ok
  ) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const result = await resumeAgentAfterApproval({
      runId,
      workspaceId,
      projectId,
      agentId,
      profileId: auth.user.id,
      decision,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
