import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  NotificationClientType,
  NotificationEndpointType,
} from "@/lib/notifications/types";

export const runtime = "nodejs";

const CLIENT_TYPES = new Set<NotificationClientType>([
  "capacitor_ios",
  "capacitor_android",
  "electron",
  "web",
]);

const ENDPOINT_TYPES = new Set<NotificationEndpointType>([
  "apns",
  "fcm",
  "web_push",
  "realtime_session",
]);

function newEndpointId() {
  return `ne_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Upsert a notification endpoint for the authenticated user. */
export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    clientType?: string;
    endpointType?: string;
    deviceId?: string;
    pushToken?: string | null;
    pushSubscription?: Record<string, unknown> | null;
    appVersion?: string | null;
    environment?: string;
    enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const clientType = body.clientType as NotificationClientType;
  const endpointType = body.endpointType as NotificationEndpointType;
  const deviceId = body.deviceId?.trim();
  if (!CLIENT_TYPES.has(clientType) || !ENDPOINT_TYPES.has(endpointType)) {
    return NextResponse.json({ error: "Invalid client/endpoint type." }, { status: 400 });
  }
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required." }, { status: 400 });
  }

  const environment =
    body.environment === "development" ? "development" : "production";
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("notification_endpoints")
    .select("id")
    .eq("profile_id", auth.user.id)
    .eq("client_type", clientType)
    .eq("device_id", deviceId)
    .maybeSingle();

  const row = {
    profile_id: auth.user.id,
    client_type: clientType,
    endpoint_type: endpointType,
    device_id: deviceId,
    push_token: body.pushToken?.trim() || null,
    push_subscription: body.pushSubscription ?? null,
    app_version: body.appVersion?.trim() || null,
    environment,
    enabled: body.enabled !== false,
    last_seen_at: now,
    updated_at: now,
  };

  if (existing?.id) {
    const { data, error } = await admin
      .from("notification_endpoints")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ endpoint: data });
  }

  const { data, error } = await admin
    .from("notification_endpoints")
    .insert({ id: newEndpointId(), ...row, created_at: now })
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ endpoint: data });
}

/** List or disable endpoints for the authenticated user. */
export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_endpoints")
    .select("id, client_type, endpoint_type, device_id, enabled, last_seen_at, environment, app_version")
    .eq("profile_id", auth.user.id)
    .order("last_seen_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ endpoints: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: { id?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  if (!body.id?.trim() || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "id and enabled required." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_endpoints")
    .update({ enabled: body.enabled })
    .eq("id", body.id)
    .eq("profile_id", auth.user.id)
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ endpoint: data });
}
