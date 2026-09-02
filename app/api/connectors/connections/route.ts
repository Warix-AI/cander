import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { listUserConnections } from "@/lib/connectors/lifecycle";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `read:${ctx.user.id}:connections`,
    category: "connector_read",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const connections = await listUserConnections({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      ownerId: ctx.user.id,
    });
    return NextResponse.json({ ok: true, connections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load connections.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
