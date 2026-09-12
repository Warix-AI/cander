/**
 * GET /api/admin/usage/periods
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("account_usage_periods")
    .select("*")
    .order("period_start", { ascending: false })
    .limit(limit);
  if (profileId) query = query.eq("profile_id", profileId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    periods: data ?? [],
    note: "included_minutes is a period snapshot; live plan configs may differ.",
  });
}
