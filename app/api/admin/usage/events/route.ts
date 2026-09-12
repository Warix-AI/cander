/**
 * GET /api/admin/usage/events
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
  const periodId = url.searchParams.get("periodId");
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const feature = url.searchParams.get("feature");
  const model = url.searchParams.get("model");
  const provider = url.searchParams.get("provider");
  const billable = url.searchParams.get("billable");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("ai_usage_events")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (profileId) query = query.eq("user_id", profileId);
  if (periodId) query = query.eq("period_id", periodId);
  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (feature) query = query.eq("feature", feature);
  if (model) query = query.eq("model", model);
  if (provider) query = query.eq("provider", provider);
  if (billable === "true") query = query.eq("billable_to_user", true);
  if (billable === "false") query = query.eq("billable_to_user", false);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    events: data ?? [],
    note: "subscription_id on events is often empty — do not require it.",
  });
}
