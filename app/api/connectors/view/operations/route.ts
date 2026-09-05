import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import { runConnectorOperation } from "@/lib/connectors/sdk/operations";
import { getConnectorViewAdapter } from "@/lib/connectors/sdk/registry";
import "@/lib/connectors/sdk/registry";

export const runtime = "nodejs";

const ALLOWED_OPS = new Set([
  "compose",
  "send",
  "reply",
  "archive",
  "markRead",
  "markUnread",
  "readBody",
  "listEvents",
  "listCalendars",
  "createEvent",
  "quickAdd",
]);

/**
 * ConnectorOperations for UI / automations (confirmed writes). Never LLM.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  let body: {
    workspaceId?: string;
    connectorId?: string;
    connectionId?: string;
    operation?: string;
    input?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const connectorId = body.connectorId?.trim();
  const operation = body.operation?.trim();
  if (!connectorId || !operation || !ALLOWED_OPS.has(operation)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const adapter = getConnectorViewAdapter(connectorId);
  if (!adapter) {
    return NextResponse.json(
      { error: `No view adapter for ${connectorId}.` },
      { status: 400 },
    );
  }

  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: body.workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `ops:${ctx.user.id}:${connectorId}:${operation}`,
    category: "connector_tool_execute",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  const result = await runConnectorOperation({
    client: ctx.client,
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
    connectorId,
    connectionId: body.connectionId,
    operation,
    input: body.input,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    connectionId: result.connectionId,
    data: result.result.data ?? {},
  });
}
