/**
 * POST /api/experts/consult
 * Cander consults a specific Expert with a situation (no Instructions in request).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { listExpertDirectory } from "@/lib/agents/directory";
import { consultExpert } from "@/lib/agents/routing";
import { assertWorkspaceMember } from "@/lib/agents/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    workspaceId?: string;
    expertId?: string;
    situation?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const expertId = body.expertId?.trim();
  const situation = body.situation?.trim();
  if (!workspaceId || !expertId || !situation) {
    return NextResponse.json(
      { error: "workspaceId, expertId, and situation are required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const entries = await listExpertDirectory({
      workspaceId,
      includeDraft: true,
    });
    const expert = entries.find((e) => e.id === expertId);
    if (!expert) {
      return NextResponse.json({ error: "Expert not found." }, { status: 404 });
    }

    const result = await consultExpert({
      agentId: expert.id,
      workspaceId,
      projectId: expert.projectId,
      profileId: auth.user.id,
      situation,
      triggerType: "consult",
    });

    return NextResponse.json({
      expert: {
        id: expert.id,
        name: expert.name,
        description: expert.description,
        status: expert.status,
        projectId: expert.projectId,
      },
      run: result.run,
      content: result.content,
      toolCount: result.toolCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Consult failed." },
      { status: 400 },
    );
  }
}
