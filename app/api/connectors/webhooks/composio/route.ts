import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { getConnectorProvider } from "@/lib/connectors/provider";
import { checkConnectorRateLimitDurable } from "@/lib/connectors/durable-rate-limit";
import { claimWebhookReceipt } from "@/lib/connectors/webhook-receipts";
import {
  reconcileConnectionDisconnected,
  reconcileConnectionFailed,
} from "@/lib/connectors/reconcile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const provider = getConnectorProvider();
  const verified = await provider.verifyWebhook({
    rawBody,
    headers: request.headers,
  });
  if (!verified.ok || !verified.eventId) {
    return NextResponse.json(
      { error: verified.error ?? "Invalid webhook." },
      { status: 401 },
    );
  }

  const admin = createSupabaseAdminClient();
  const receipt = await claimWebhookReceipt(admin, {
    provider: "composio",
    eventId: verified.eventId,
    connectionId: null,
  });
  if (!receipt.ok) {
    return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
  }
  if (!receipt.claimed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const providerConnectionId = verified.connectedAccountId?.trim();
  if (!providerConnectionId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: connection } = await admin
    .from("connector_connections")
    .select("id, workspace_id, owner_id, status, composio_user_id")
    .eq("provider_connection_id", providerConnectionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (
    verified.composioUserId &&
    connection.composio_user_id &&
    verified.composioUserId !== connection.composio_user_id
  ) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const rate = await checkConnectorRateLimitDurable({
    category: "connector_webhook",
    workspaceId: connection.workspace_id,
    profileId: connection.owner_id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  const status = (verified.status ?? "").toUpperCase();
  if (status === "ACTIVE") {
    // Callback identity verification is the only activation path.
    if (connection.status === "pending") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    return NextResponse.json({ ok: true, noop: true });
  }
  if (status === "DISCONNECTED" || status === "INACTIVE") {
    await reconcileConnectionDisconnected(admin, connection.id);
  } else if (status === "FAILED" || status === "EXPIRED") {
    await reconcileConnectionFailed(admin, {
      connectionId: connection.id,
      failureDetail: "Provider reported failure.",
    });
  }

  return NextResponse.json({ ok: true });
}
