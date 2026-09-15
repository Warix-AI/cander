import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { createNotification } from "@/lib/notifications/create-notification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Dev / platform-admin test notification.
 * Never open in production for arbitrary callers.
 */
export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const isDev = process.env.NODE_ENV !== "production";
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", auth.user.id)
    .maybeSingle();
  const isAdmin = Boolean(profile?.is_platform_admin);
  if (!isDev && !isAdmin) {
    return NextResponse.json({ error: "Not available." }, { status: 403 });
  }

  let body: { workspaceId?: string; title?: string; body?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }

  let workspaceId = body.workspaceId?.trim();
  if (!workspaceId) {
    const { data: membership } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("profile_id", auth.user.id)
      .limit(1)
      .maybeSingle();
    workspaceId = membership?.workspace_id ?? undefined;
  }
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId required (no membership found)." },
      { status: 400 },
    );
  }

  const result = await createNotification({
    profileId: auth.user.id,
    workspaceId,
    type: "system.test",
    title: body.title?.trim() || "Cander test notification",
    body:
      body.body?.trim() ||
      "Push and realtime delivery look good if you see this.",
    route: "/settings/notifications",
    metadata: { test: true },
    dedupeKey: `test:${auth.user.id}:${Date.now()}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    notification: result.notification,
  });
}
