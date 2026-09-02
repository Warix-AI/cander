import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { getUserConnection } from "@/lib/connectors/lifecycle";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import {
  assertWorkspaceMember,
  resolveConnectorRequest,
} from "@/lib/connectors/server-context";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const url = new URL(request.url);
  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `read:${ctx.user.id}:connection`,
    category: "connector_read",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const result = await getUserConnection({
      client: ctx.client,
      connectionId: id,
      ownerId: ctx.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.connection.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    const member = await assertWorkspaceMember(ctx.user.id, ctx.workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    return NextResponse.json({ ok: true, connection: result.connection });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
