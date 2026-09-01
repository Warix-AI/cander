import type { UsageFeatureCategory, UsageGuardInput, UsageGuardResult } from "../types.ts";
import { guardUsage, reconcileUsage } from "../enforce.ts";
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

  return {
    ok: true,
    reservationId: guard.reservationId,
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
    plan: ctx.plan,
    throttled: guard.throttled,
    notice: guard.notice,
  };
}

export async function finalizeUsageReservation(input: {
  reservationId: string | null;
  status: "confirmed" | "released" | "failed";
  actualUnits?: number;
  actualCostMicros?: number;
}) {
  if (!input.reservationId) return;
  await reconcileUsage({
    reservationId: input.reservationId,
    status: input.status,
    actualUnits: input.actualUnits,
    actualCostMicros: input.actualCostMicros,
  });
}

export type UsageGuardSuccess = Extract<
  Awaited<ReturnType<typeof enforceUsageForRequest>>,
  { ok: true }
>;

export type UsageGuardDenied = Extract<
  UsageGuardResult,
  { ok: false }
>;
