/**
 * GET /api/experts/directory?workspaceId=
 * Lightweight Expert directory — id, name, description, status only.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  formatExpertDirectoryForPrompt,
  listExpertDirectory,
  searchExpertDirectory,
} from "@/lib/agents/directory";
import { assertWorkspaceMember } from "@/lib/agents/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const projectId = url.searchParams.get("projectId")?.trim() || undefined;
  const query = url.searchParams.get("q")?.trim() || "";
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
    const all = await listExpertDirectory({
      workspaceId,
      projectId,
      includeDraft: false,
    });
    const experts = query
      ? searchExpertDirectory(all, query, 8)
      : all;
    return NextResponse.json({
      experts: experts.map((e) => ({
        id: e.id,
        projectId: e.projectId,
        name: e.name,
        description: e.description,
        status: e.status,
      })),
      summary: formatExpertDirectoryForPrompt(experts),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed." },
      { status: 400 },
    );
  }
}
