/**
 * GET/PATCH /api/admin/ai-minutes-plans
 * Platform-admin only. Org Owner/Admin cannot mutate global plan configs.
 *
 * PATCH never rewrites open billing-period snapshots — only future periods
 * pick up new included_minutes via ensureAccountUsagePeriod.
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { writeAdminAudit } from "@/lib/admin/audit";
import { normalizePlan } from "@/lib/plans";
import type { BillingPlan } from "@/lib/types";
import {
  clearAiPlanMinuteConfigCache,
  loadAiPlanMinuteConfigs,
  upsertAiPlanMinuteConfig,
  type AiPlanMinuteConfig,
} from "@/lib/usage/ai-minutes";

export const runtime = "nodejs";

const PLAN_IDS = new Set(["free", "pro", "max", "ultra", "enterprise"]);

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const configs = await loadAiPlanMinuteConfigs({ force: true });
  return NextResponse.json({
    ok: true,
    plans: Object.values(configs),
    note: "Changing included_minutes affects NEW billing periods only. Open periods keep their snapshot.",
  });
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Partial<AiPlanMinuteConfig> & { planId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.planId || !PLAN_IDS.has(String(body.planId))) {
    return NextResponse.json({ error: "Valid planId required." }, { status: 400 });
  }
  const planId = normalizePlan(body.planId) as BillingPlan;

  const beforeConfigs = await loadAiPlanMinuteConfigs({ force: true });
  const before = beforeConfigs[planId] ?? null;

  const updated = await upsertAiPlanMinuteConfig(
    {
      planId,
      ...(body.includedMinutes != null
        ? { includedMinutes: Number(body.includedMinutes) }
        : {}),
      ...(body.minimumMinutes !== undefined
        ? { minimumMinutes: body.minimumMinutes }
        : {}),
      ...(body.maximumMinutes !== undefined
        ? { maximumMinutes: body.maximumMinutes }
        : {}),
      ...(body.minutesStep != null ? { minutesStep: Number(body.minutesStep) } : {}),
      ...(body.internalBudgetUsd != null
        ? { internalBudgetUsd: Number(body.internalBudgetUsd) }
        : {}),
      ...(body.usageLimitBehavior
        ? { usageLimitBehavior: body.usageLimitBehavior }
        : {}),
      ...(body.label ? { label: body.label } : {}),
      ...(body.active != null ? { active: Boolean(body.active) } : {}),
    },
    auth.user.id,
  );

  clearAiPlanMinuteConfigCache();
  await writeAdminAudit({
    actorId: auth.user.id,
    action: "plan_minutes.update",
    targetType: "ai_plan_minute_config",
    targetId: planId,
    before,
    after: updated,
    reason: body.reason ?? null,
  });

  return NextResponse.json({
    ok: true,
    plan: updated,
    note: "Open billing periods retain their prior included_minutes snapshot.",
  });
}
