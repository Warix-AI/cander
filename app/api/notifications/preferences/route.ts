import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { normalizeNotificationPreferences } from "@/lib/notifications/preferences";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("notification_preferences")
    .select("prefs")
    .eq("profile_id", auth.user.id)
    .maybeSingle();
  return NextResponse.json({
    prefs: normalizeNotificationPreferences(
      data?.prefs ?? DEFAULT_NOTIFICATION_PREFERENCES,
    ),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: { prefs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const prefs = normalizeNotificationPreferences(body.prefs);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_preferences")
    .upsert(
      {
        profile_id: auth.user.id,
        prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    )
    .select("prefs")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    prefs: normalizeNotificationPreferences(data?.prefs ?? prefs),
  });
}
