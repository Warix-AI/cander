import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { setConnectionWorkspaceShare } from "@/lib/connectors/lifecycle";
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

  let body: { workspaceId?: string; shared?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (typeof body.shared !== "boolean") {
    return NextResponse.json(
      { error: "shared must be a boolean." },
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
    key: `share:${ctx.user.id}`,
    category: "connector_initiate",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const result = await setConnectionWorkspaceShare({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      ownerId: ctx.user.id,
      connectionId,
      shared: body.shared,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ connection: result.connection });
  } catch (err) {
    console.error("[connectors/share]", err);
    return NextResponse.json(
      { error: "Could not update workspace sharing." },
      { status: 500 },
    );
  }
}
