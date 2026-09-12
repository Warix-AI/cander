/**
 * GET /api/admin/pricing — list pricing plans.
 * PATCH /api/admin/pricing — update a pricing plan (audited).
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import {
  loadPricingPlans,
  upsertPricingPlan,
  type PricingPlanPatch,
} from "@/lib/admin/pricing";
import { normalizePlan } from "@/lib/plans";
import type { BillingPlan } from "@/lib/types";

export const runtime = "nodejs";

const PLAN_IDS = new Set(["free", "pro", "max", "ultra", "enterprise"]);

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const plans = await loadPricingPlans();
    return NextResponse.json({
      ok: true,
      plans,
      note: "Pricing is provider-independent. Affects display/preview; metering uses ai_plan_minute_configs. New billing periods only for minute changes.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load pricing." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: PricingPlanPatch;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.planId || !PLAN_IDS.has(String(body.planId))) {
    return NextResponse.json({ error: "Valid planId required." }, { status: 400 });
  }

  try {
    const plan = await upsertPricingPlan(
      { ...body, planId: normalizePlan(body.planId) as BillingPlan },
      auth.user.id,
    );
    return NextResponse.json({
      ok: true,
      plan,
      note: "Affects new billing periods only for minute-related fields. Open period snapshots are unchanged.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 500 },
    );
  }
}
