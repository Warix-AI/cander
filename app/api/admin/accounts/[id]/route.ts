/**
 * GET /api/admin/accounts/[id]
 * POST — apply AI-minute override (audited).
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import {
  applyAccountOverride,
  listAccountOverrides,
} from "@/lib/admin/overrides";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePlan } from "@/lib/plans";
import type { BillingPlan } from "@/lib/types";
import {
  NotConnectedBillingProvider,
  resolveBillingProviderDisplay,
} from "@/lib/billing-provider/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(
      "id, email, name, plan, role, subscription_status, subscription_period_end, stripe_customer_id, stripe_subscription_id, ai_minutes_override, ai_minutes_plan, is_platform_admin, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const overrides = await listAccountOverrides(id);
  const provider = resolveBillingProviderDisplay(profile);
  const polar = await NotConnectedBillingProvider.getCustomer(id);

  const eventSelect =
    "id, event_type, email, ip, user_agent, referrer, landing_url, landing_path, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, timezone, locale, geo_country, geo_region, geo_city, metadata, created_at";

  const [byProfile, byEmail] = await Promise.all([
    admin
      .from("auth_events")
      .select(eventSelect)
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    profile.email
      ? admin
          .from("auth_events")
          .select(eventSelect)
          .eq("email", String(profile.email).toLowerCase())
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  if (byProfile.error) {
    console.warn("[admin/accounts] auth_events", byProfile.error.message);
  }
  if (byEmail.error) {
    console.warn("[admin/accounts] auth_events email", byEmail.error.message);
  }

  const authEventsById = new Map<string, Record<string, unknown>>();
  for (const row of [...(byProfile.data ?? []), ...(byEmail.data ?? [])]) {
    const event = row as { id?: string };
    if (event.id) authEventsById.set(event.id, row as Record<string, unknown>);
  }
  const authEvents = [...authEventsById.values()].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );

  return NextResponse.json({
    ok: true,
    account: profile,
    overrides,
    authEvents,
    billing: {
      provider,
      stripe:
        provider === "stripe"
          ? {
              customerId: profile.stripe_customer_id,
              subscriptionId: profile.stripe_subscription_id,
              status: profile.subscription_status,
              periodEnd: profile.subscription_period_end,
            }
          : null,
      polarConnected: NotConnectedBillingProvider.connected,
      polarCustomer: polar,
      message:
        provider === "none"
          ? "Billing provider not connected"
          : provider === "stripe"
            ? "Stripe fields (read-only in admin)."
            : "Billing provider not connected",
    },
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  let body: {
    aiMinutesOverride?: number | null;
    aiMinutesPlan?: string | null;
    reason?: string;
    expiresAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const result = await applyAccountOverride({
      profileId: id,
      actorId: auth.user.id,
      aiMinutesOverride: body.aiMinutesOverride,
      aiMinutesPlan:
        body.aiMinutesPlan === undefined
          ? undefined
          : body.aiMinutesPlan === null
            ? null
            : (normalizePlan(body.aiMinutesPlan) as BillingPlan),
      reason: body.reason ?? null,
      expiresAt: body.expiresAt ?? null,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      note: "Open period snapshots are unchanged unless you use an explicit apply-to-current-period action.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Override failed." },
      { status: 500 },
    );
  }
}
