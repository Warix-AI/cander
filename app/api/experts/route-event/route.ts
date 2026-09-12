/**
 * POST /api/experts/route-event
 * Connector sync → Cander routes via lightweight Expert directory → optional consult.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertWorkspaceMember } from "@/lib/agents/server";
import { routeEventToExpert } from "@/lib/agents/routing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    workspaceId?: string;
    situation?: string;
    projectId?: string;
    connectionId?: string;
    triggerPayload?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const situation = body.situation?.trim();
  if (!workspaceId || !situation) {
    return NextResponse.json(
      { error: "workspaceId and situation are required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const routed = await routeEventToExpert({
      workspaceId,
      profileId: auth.user.id,
      situation,
      projectId: body.projectId?.trim() || null,
      connectionId: body.connectionId?.trim(),
      triggerPayload: body.triggerPayload,
    });
    return NextResponse.json(routed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Routing failed." },
      { status: 400 },
    );
  }
}
