import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import { runConnectorSync } from "@/lib/connectors/sdk/sync";
import "@/lib/connectors/sdk/registry";

export const runtime = "nodejs";

/**
 * Manual connector sync (no LLM). Same entrypoint can later be called from cron.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  let body: {
    workspaceId?: string;
    connectorId?: string;
    connectionId?: string;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const connectorId = body.connectorId?.trim();
  if (!connectorId) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: body.workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `sync:${ctx.user.id}:${connectorId}`,
    category: "connector_tool_execute",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  const result = await runConnectorSync({
    client: ctx.client,
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
    connectorId,
    connectionId: body.connectionId,
    limit: body.limit,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    connectionId: result.connectionId,
    upserted: result.upserted,
    lastSyncedAt: result.lastSyncedAt,
  });
}
