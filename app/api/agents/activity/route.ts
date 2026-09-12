/**
 * GET /api/agents/activity?workspaceId=
 * Cross-agent Activity feed for the sidebar Agents section.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertWorkspaceMember,
  listWorkspaceAgentActivity,
} from "@/lib/agents/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? 40);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required." },
      { status: 400 },
    );
  }
  if (!(await assertWorkspaceMember(workspaceId, auth.user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const activity = await listWorkspaceAgentActivity({
      workspaceId,
      limit: Number.isFinite(limitRaw) ? limitRaw : 40,
    });
    return NextResponse.json({ activity });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed." },
      { status: 400 },
    );
  }
}
