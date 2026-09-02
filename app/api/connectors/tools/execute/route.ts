import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import { executeConnectorTool } from "@/lib/connectors/tool-execute";
import { getCanderTool } from "@/lib/ai/tools/cander-registry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  let body: {
    workspaceId?: string;
    tool?: string;
    arguments?: Record<string, unknown>;
    connectionId?: string;
    toolCallId?: string;
    confirmed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: body.workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const tool = body.tool?.trim();
  if (!tool || !getCanderTool(tool)?.connectorId) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `tool:${ctx.user.id}:${tool}`,
    category: "connector_tool_execute",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const result = await executeConnectorTool({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      profileId: ctx.user.id,
      tool,
      arguments: body.arguments ?? {},
      connectionId: body.connectionId,
      toolCallId: body.toolCallId,
      confirmed: body.confirmed,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, output: result.output });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not execute connector tool.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
