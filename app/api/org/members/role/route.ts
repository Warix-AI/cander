import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { Role } from "@/lib/types";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { memberId?: string; orgId?: string; role?: Role };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (
    !body.memberId ||
    !body.orgId ||
    (body.role !== "Owner" && body.role !== "Admin" && body.role !== "Member")
  ) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: actorMember } = await admin
    .from("org_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("org_id", body.orgId)
    .maybeSingle();

  if (actorMember?.role !== "Owner" && actorMember?.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: target, error: targetError } = await admin
    .from("org_members")
    .select("id, role, profile_id")
    .eq("id", body.memberId)
    .eq("org_id", body.orgId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (target.role === "Owner" && actorMember.role !== "Owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (body.role === "Owner" && actorMember.role !== "Owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (target.role === "Owner" && body.role !== "Owner") {
    const { count } = await admin
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", body.orgId)
      .eq("role", "Owner")
      .eq("seat_status", "active");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Organizations need at least one owner." },
        { status: 400 },
      );
    }
  }

  const { error: memberError } = await admin
    .from("org_members")
    .update({ role: body.role })
    .eq("id", body.memberId);

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (target.profile_id) {
    await admin
      .from("profiles")
      .update({ role: body.role })
      .eq("id", target.profile_id);
  }

  return NextResponse.json({ ok: true, role: body.role });
}
