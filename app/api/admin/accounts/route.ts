/**
 * GET /api/admin/accounts — search/filter/paginate profiles.
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
  const q = (url.searchParams.get("q") ?? "").trim();
  const plan = url.searchParams.get("plan");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("profiles")
    .select(
      "id, email, name, plan, role, subscription_status, subscription_period_end, stripe_customer_id, stripe_subscription_id, ai_minutes_override, ai_minutes_plan, is_platform_admin, created_at, updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  }
  if (plan) {
    query = query.eq("plan", plan);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    accounts: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
