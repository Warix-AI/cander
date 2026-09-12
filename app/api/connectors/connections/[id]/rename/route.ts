import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { renameConnection } from "@/lib/connectors/lifecycle";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const { id: connectionId } = await params;
  if (!connectionId?.trim()) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  let body: { workspaceId?: string; displayName?: string };
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

  const rate = await checkConnectorRateLimitAsync({
    key: `rename:${ctx.user.id}`,
    category: "connector_initiate",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const result = await renameConnection({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      ownerId: ctx.user.id,
      connectionId: connectionId.trim(),
      displayName: body.displayName ?? "",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, connection: result.connection });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not rename connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
