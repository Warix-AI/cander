import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { initiateConnection } from "@/lib/connectors/lifecycle";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  let body: { workspaceId?: string; connectorId?: string };
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

  const connectorId = body.connectorId?.trim();
  if (!connectorId) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `initiate:${ctx.user.id}`,
    category: "connector_initiate",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const result = await initiateConnection({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      ownerId: ctx.user.id,
      connectorId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      connection: result.connection,
      reused: result.reused,
      authorizationUrl: result.authorizationUrl ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not initiate connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
