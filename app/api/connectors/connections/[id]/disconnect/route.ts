import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { disconnectConnection } from "@/lib/connectors/lifecycle";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { checkConnectorRateLimit } from "@/lib/connectors/rate-limit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const { id } = await context.params;

  let body: { workspaceId?: string };
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

  const rate = checkConnectorRateLimit(`disconnect:${ctx.user.id}`);
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const result = await disconnectConnection({
      client: ctx.client,
      connectionId: id,
      ownerId: ctx.user.id,
      workspaceId: ctx.workspaceId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      connection: result.connection,
      alreadyDisconnected: result.alreadyDisconnected,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not disconnect.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
