import type { UsageFeatureCategory, UsageGuardInput, UsageGuardResult } from "../types.ts";
import { guardUsage, reconcileUsage } from "../enforce.ts";
import {
  aiSourceForFeature,
  finishAIUsageExecution,
  isAiMeteredFeature,
  startAIUsageExecution,
} from "../ai-minutes/index.ts";
import { microsToUsd } from "../ai-minutes/format.ts";
import {
  clientIp,
  resolveRequestUser,
  resolveUsageContext,
  usageJsonError,
} from "./context.ts";

export async function enforceUsageForRequest(input: {
  request: Request;
  feature: UsageFeatureCategory;
  workspaceId?: string | null;
  threadId?: string | null;
  idempotencyKey: string;
  estimatedUnits?: number;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
  /** Nested AI work under a parent execution — recorded for cost, not user minutes. */
  parentExecutionId?: string | null;
  /** Allow Supabase cookie sessions (computer routes, EventSource). */
  allowCookieAuth?: boolean;
}): Promise<
  | {
      ok: true;
      reservationId: string;
      workspaceId: string;
      profileId: string;
      plan: import("@/lib/types").BillingPlan;
      throttled: boolean;
      notice?: string;
      /** Universal AI-minute execution id (null when feature is not AI-metered). */
      aiExecutionId: string | null;
    }
  | { ok: false; response: Response }
> {
  const user = await resolveRequestUser(input.request, {
    allowCookie: input.allowCookieAuth,
  });
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const ctx = await resolveUsageContext({
    user,
    workspaceId: input.workspaceId,
    threadId: input.threadId,
  });
  if (!ctx.ok) {
    return {
      ok: false,
      response: Response.json({ error: ctx.error }, { status: ctx.status }),
    };
  }

  const guardInput: UsageGuardInput = {
    feature: input.feature,
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
    idempotencyKey: input.idempotencyKey,
    estimatedUnits: input.estimatedUnits ?? 1,
    unitKind: "requests",
    ipAddress: clientIp(input.request),
    provider: input.provider ?? null,
    model: input.model ?? null,
    metadata: input.metadata,
  };

  const guard = await guardUsage(guardInput, { plan: ctx.plan });
  if (!guard.ok) {
    return { ok: false, response: usageJsonError(guard) };
  }

  let aiExecutionId: string | null = null;
  if (isAiMeteredFeature(input.feature)) {
    try {
      const metaSource = input.metadata?.aiSource;
      const source =
        typeof metaSource === "string" && metaSource.length
          ? (metaSource as import("../ai-minutes/types.ts").AIUsageSource)
          : aiSourceForFeature(input.feature);
      const execution = await startAIUsageExecution({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        planId: ctx.plan,
        plan: ctx.plan,
        executionId: guard.reservationId,
        parentExecutionId: input.parentExecutionId ?? null,
        source,
        feature: input.feature,
        provider: input.provider ?? null,
        model: input.model ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          reservationId: guard.reservationId,
          usageFeature: input.feature,
        },
      });
      aiExecutionId = execution.executionId;
    } catch {
      // Dollar/request guard already reserved; minutes ledger is best-effort.
      aiExecutionId = guard.reservationId;
    }
  }

  return {
    ok: true,
    reservationId: guard.reservationId,
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
    plan: ctx.plan,
    throttled: guard.throttled,
    notice: guard.notice,
    aiExecutionId,
  };
}

export async function finalizeUsageReservation(input: {
  reservationId: string | null;
  status: "confirmed" | "released" | "failed";
  actualUnits?: number;
  actualCostMicros?: number;
  model?: string | null;
  provider?: string | null;
  /** Override AI execution id when it differs from reservationId. */
  aiExecutionId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!input.reservationId) return;
  await reconcileUsage({
    reservationId: input.reservationId,
    status: input.status,
    actualUnits: input.actualUnits,
    actualCostMicros: input.actualCostMicros,
  });

  const executionId = input.aiExecutionId ?? input.reservationId;
  const aiStatus =
    input.status === "confirmed"
      ? "completed"
      : input.status === "released"
        ? "cancelled"
        : "failed";

  try {
    await finishAIUsageExecution({
      executionId,
      status: aiStatus,
      model: input.model,
      provider: input.provider,
      actualCostUsd: microsToUsd(input.actualCostMicros),
      estimatedCostUsd: microsToUsd(input.actualCostMicros),
      metadata: input.metadata,
    });
  } catch {
    // Minutes finalize is best-effort; request/$ reconcile already applied.
  }
}

export type UsageGuardSuccess = Extract<
  Awaited<ReturnType<typeof enforceUsageForRequest>>,
  { ok: true }
>;

export type UsageGuardDenied = Extract<
  UsageGuardResult,
  { ok: false }
>;
