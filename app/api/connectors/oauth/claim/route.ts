import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { verifyOAuthCallback } from "@/lib/connectors/lifecycle";
import {
  listOpenOAuthSessionDrops,
  markOAuthSessionDropClaimed,
} from "@/lib/connectors/oauth-session-drop";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Signed-in Cander window claims a session_uri parked by an external-browser
 * verifier redirect, then completes Composio callback identity verification.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  let body: { workspaceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: body.workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `oauth-claim:${ctx.user.id}`,
    category: "connector_callback",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  const admin = createSupabaseAdminClient();
  const drops = await listOpenOAuthSessionDrops(admin);
  if (!drops.length) {
    return NextResponse.json({ ok: true, claimed: false });
  }

  for (const drop of drops) {
    const result = await verifyOAuthCallback({
      ownerId: ctx.user.id,
      sessionUri: drop.session_uri,
    });
    if (!result.ok) continue;

    await markOAuthSessionDropClaimed(admin, drop.id, ctx.user.id);
    return NextResponse.json({
      ok: true,
      claimed: true,
      connectorId: result.connection.connectorId,
      connection: result.connection,
    });
  }

  return NextResponse.json({ ok: true, claimed: false });
}
