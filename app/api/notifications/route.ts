import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") || 40) || 40),
  );
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("*")
    .eq("profile_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: { id?: string; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  if (body.all) {
    const { error } = await admin
      .from("notifications")
      .update({ read_at: now })
      .eq("profile_id", auth.user.id)
      .is("read_at", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  if (!body.id?.trim()) {
    return NextResponse.json({ error: "id required." }, { status: 400 });
  }
  const { data, error } = await admin
    .from("notifications")
    .update({ read_at: now })
    .eq("id", body.id)
    .eq("profile_id", auth.user.id)
    .select("id, read_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ notification: data });
}
