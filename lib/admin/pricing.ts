/**
 * Provider-independent pricing plans (SoT for admin Pricing UI / slider preview).
 * Separate from ai_plan_minute_configs (metering). Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BillingPlan } from "@/lib/types";
import { writeAdminAudit } from "@/lib/admin/audit";
import {
  type PricingPlanRow,
  previewPriceForMinutes,
} from "@/lib/admin/pricing-types";

export type { PricingPlanRow };
export { previewPriceForMinutes };

function mapRow(row: Record<string, unknown>): PricingPlanRow {
  return {
    planId: row.plan_id as BillingPlan,
    displayName: String(row.display_name ?? ""),
    baseMonthlyPriceUsd: Number(row.base_monthly_price_usd ?? 0),
    includedMinutes: Number(row.included_minutes ?? 0),
    minimumMinutes:
      row.minimum_minutes == null ? null : Number(row.minimum_minutes),
    maximumMinutes:
      row.maximum_minutes == null ? null : Number(row.maximum_minutes),
    minutesStep: Number(row.minutes_step ?? 1),
    priceIncrementUsd: Number(row.price_increment_usd ?? 0),
    pricingMode: row.pricing_mode === "adjustable" ? "adjustable" : "fixed",
    isPublic: Boolean(row.is_public),
    isSelfServe: Boolean(row.is_self_serve),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export async function loadPricingPlans(): Promise<PricingPlanRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("pricing_plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export type PricingPlanPatch = Partial<Omit<PricingPlanRow, "planId">> & {
  planId: BillingPlan;
  reason?: string | null;
};

export async function upsertPricingPlan(
  patch: PricingPlanPatch,
  actorId: string,
): Promise<PricingPlanRow> {
  const admin = createSupabaseAdminClient();
  const { data: beforeRow } = await admin
    .from("pricing_plans")
    .select("*")
    .eq("plan_id", patch.planId)
    .maybeSingle();

  const update: Record<string, unknown> = {
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };
  if (patch.displayName != null) update.display_name = patch.displayName;
  if (patch.baseMonthlyPriceUsd != null)
    update.base_monthly_price_usd = patch.baseMonthlyPriceUsd;
  if (patch.includedMinutes != null)
    update.included_minutes = patch.includedMinutes;
  if (patch.minimumMinutes !== undefined)
    update.minimum_minutes = patch.minimumMinutes;
  if (patch.maximumMinutes !== undefined)
    update.maximum_minutes = patch.maximumMinutes;
  if (patch.minutesStep != null) update.minutes_step = patch.minutesStep;
  if (patch.priceIncrementUsd != null)
    update.price_increment_usd = patch.priceIncrementUsd;
  if (patch.pricingMode != null) update.pricing_mode = patch.pricingMode;
  if (patch.isPublic != null) update.is_public = patch.isPublic;
  if (patch.isSelfServe != null) update.is_self_serve = patch.isSelfServe;
  if (patch.active != null) update.active = patch.active;
  if (patch.sortOrder != null) update.sort_order = patch.sortOrder;
  if (patch.metadata != null) update.metadata = patch.metadata;

  const { data, error } = await admin
    .from("pricing_plans")
    .update(update)
    .eq("plan_id", patch.planId)
    .select("*")
    .single();
  if (error) throw error;

  const after = mapRow(data as Record<string, unknown>);
  await writeAdminAudit({
    actorId,
    action: "pricing_plan.update",
    targetType: "pricing_plan",
    targetId: patch.planId,
    before: beforeRow ? mapRow(beforeRow as Record<string, unknown>) : null,
    after,
    reason: patch.reason ?? null,
  });
  return after;
}
