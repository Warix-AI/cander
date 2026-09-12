import { normalizePlan } from "@/lib/plans";
import type { BillingPlan } from "@/lib/types";

/** Resolve billing plan for a profile (usage metering). */
export async function resolveBillingPlanForProfile(
  profileId: string,
): Promise<BillingPlan> {
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("plan, ai_minutes_plan")
      .eq("id", profileId)
      .maybeSingle();
    if (data?.ai_minutes_plan) return normalizePlan(data.ai_minutes_plan);
    return normalizePlan(data?.plan);
  } catch {
    return "free";
  }
}
