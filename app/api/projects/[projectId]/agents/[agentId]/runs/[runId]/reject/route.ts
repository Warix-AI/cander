/**
 * POST /api/projects/[projectId]/agents/[agentId]/runs/[runId]/reject
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { rejectAgentRun } from "@/lib/agents/approvals";
import {
  assertProjectAccessForUser,
  assertWorkspaceMember,
} from "@/lib/agents/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ projectId: string; agentId: string; runId: string }>;
  },
) {
  const {
    projectId: rawProjectId,
    agentId: rawAgentId,
    runId: rawRunId,
  } = await context.params;
  const projectId = rawProjectId?.trim();
  const agentId = rawAgentId?.trim();
  const runId = rawRunId?.trim();
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { workspaceId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  if (!projectId || !agentId || !runId || !workspaceId) {
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
    const run = await rejectAgentRun({
      workspaceId,
      projectId,
      agentId,
      runId,
      reason: body.reason,
    });
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reject failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
