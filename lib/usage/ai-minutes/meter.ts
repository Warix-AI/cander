/**
 * Central AI usage meter — every AI pathway should use this.
 *
 * startAIUsageExecution → (work) → finishAIUsageExecution
 * or withAIUsageMeter(...) which always finishes in finally.
 */

import type { BillingPlan } from "../../types.ts";
import {
  completeAIUsageEvent,
  insertAIUsageEvent,
} from "./store.ts";
import type {
  AIUsageEvent,
  FinishAIUsageInput,
  StartAIUsageInput,
} from "./types.ts";

export async function startAIUsageExecution(
  input: StartAIUsageInput & { plan?: BillingPlan },
): Promise<AIUsageEvent> {
  let periodId = input.periodId ?? null;
  if (!periodId && input.plan) {
    try {
      const { ensureAccountUsagePeriod } = await import(
        "../account-period.ts"
      );
      const period = await ensureAccountUsagePeriod({
        profileId: input.userId,
        plan: input.plan,
      });
      periodId = period?.id ?? null;
    } catch {
      periodId = null;
    }
  }

  return insertAIUsageEvent({
    ...input,
    periodId,
    // Nested spans never bill wall-clock minutes to the user.
    billableToUser:
      input.billableToUser ?? input.parentExecutionId == null,
  });
}

export async function finishAIUsageExecution(
  input: FinishAIUsageInput & {
    /** Refresh period aggregate after write (default true). */
    refreshAggregate?: boolean;
    plan?: BillingPlan;
    userId?: string;
  },
): Promise<AIUsageEvent | null> {
  const event = await completeAIUsageEvent(input);
  if (!event) return null;

  if (input.refreshAggregate !== false) {
    const plan = (input.plan ?? event.planId) as BillingPlan;
    const userId = input.userId ?? event.userId;
    if (plan && userId) {
      try {
        const { refreshAIMinutesAggregate } = await import("./aggregate.ts");
        await refreshAIMinutesAggregate({ profileId: userId, plan });
      } catch {
        // Aggregate refresh is best-effort; ledger row is source of truth.
      }
    }
  }

  return event;
}

/**
 * Run an AI workload inside the universal meter.
 * Always records duration — including failures/cancellations.
 */
export async function withAIUsageMeter<T>(
  input: StartAIUsageInput & { plan?: BillingPlan },
  work: (execution: AIUsageEvent) => Promise<T>,
  opts?: {
    onSuccess?: (result: T) => {
      model?: string | null;
      provider?: string | null;
      estimatedCostUsd?: number | null;
      actualCostUsd?: number | null;
      metadata?: Record<string, unknown>;
    };
    mapErrorStatus?: (err: unknown) => FinishAIUsageInput["status"];
  },
): Promise<T> {
  const execution = await startAIUsageExecution(input);
  try {
    const result = await work(execution);
    const extras = opts?.onSuccess?.(result) ?? {};
    await finishAIUsageExecution({
      executionId: execution.executionId,
      status: "completed",
      plan: input.plan,
      userId: input.userId,
      ...extras,
    });
    return result;
  } catch (err) {
    const status = opts?.mapErrorStatus?.(err) ?? "failed";
    await finishAIUsageExecution({
      executionId: execution.executionId,
      status,
      plan: input.plan,
      userId: input.userId,
      metadata: {
        error: err instanceof Error ? err.message : "AI execution failed",
      },
    });
    throw err;
  }
}
