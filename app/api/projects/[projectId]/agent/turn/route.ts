/**
 * POST /api/projects/:id/agent/turn — Cander front agent.
 *
 * Body: { workspaceId, message, history?: [{role, content}] }
 * Returns the agent's structured decision for this chat turn. The client
 * executes it (starts a build run, opens Publish, or shows the reply) so the
 * chat UI and its job/publish event wiring stay unchanged.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { getProjectBuildPhase } from "@/lib/build/build-phase";
import { resolveProjectRuntime } from "@/lib/build/project-runtime";
import { runFrontAgentTurn } from "@/lib/ai/agent/front-agent";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ projectId: string }> };

type Body = {
  workspaceId?: string;
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
};

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  const message = body.message?.trim();
  if (!projectId || !workspaceId || !message) {
    return NextResponse.json({ error: "projectId, workspaceId and message are required." }, { status: 400 });
  }
  if (message.length > 20_000) {
    return NextResponse.json({ error: "Message too long." }, { status: 413 });
  }

  const access = await assertProjectAccess({ projectId, workspaceId, userId: auth.user.id });
  if (!access.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const history = (body.history ?? [])
    .filter((m): m is { role: "user" | "assistant"; content: string } =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-12);

  try {
    const [phase, rt] = await Promise.all([
      getProjectBuildPhase({ projectId, workspaceId }),
      resolveProjectRuntime({ projectId, workspaceId, light: true }),
    ]);
    const publishState: "never" | "ahead" | "current" | "unknown" = !rt.repo.publishedSha
      ? "never"
      : rt.repo.draftSha && rt.repo.draftSha !== rt.repo.publishedSha
        ? "ahead"
        : "current";
    const decision = await runFrontAgentTurn({
      projectId,
      workspaceId,
      message,
      history,
      // A draft with commits is something to edit even if the last build did
      // not reach "ready" (partial create, failed repair).
      alreadyBuilt: phase === "ready" || Boolean(rt.repo.draftSha),
      publishState,
    });
    return NextResponse.json({ ok: true, decision });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[cander:front-agent] turn failed", { projectId, error: msg.slice(0, 300) });
    return NextResponse.json({ ok: false, error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
