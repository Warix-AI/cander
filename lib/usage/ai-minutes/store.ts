/**
 * Persistence for the AI active-minute ledger.
 * Service-role only; falls back to in-memory for local/tests.
 */

import { mergeIntervalsDurationMs, msToMinutes } from "./intervals.ts";
import type {
  AIUsageEvent,
  AIUsageEventStatus,
  FinishAIUsageInput,
  StartAIUsageInput,
} from "./types.ts";

type MemoryBucket = {
  events: Map<string, AIUsageEvent>;
};

const memory: MemoryBucket = { events: new Map() };

function newId(): string {
  return crypto.randomUUID();
}

function mapRow(row: Record<string, unknown>): AIUsageEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    workspaceId: row.workspace_id != null ? String(row.workspace_id) : null,
    subscriptionId:
      row.subscription_id != null ? String(row.subscription_id) : null,
    planId: String(row.plan_id),
    executionId: String(row.execution_id),
    parentExecutionId:
      row.parent_execution_id != null ? String(row.parent_execution_id) : null,
    source: row.source as AIUsageEvent["source"],
    feature: String(row.feature),
    model: row.model != null ? String(row.model) : null,
    provider: row.provider != null ? String(row.provider) : null,
    startedAt: String(row.started_at),
    endedAt: row.ended_at != null ? String(row.ended_at) : null,
    activeDurationMs:
      row.active_duration_ms != null ? Number(row.active_duration_ms) : null,
    activeMinutes:
      row.active_minutes != null ? Number(row.active_minutes) : null,
    estimatedCostUsd:
      row.estimated_cost_usd != null ? Number(row.estimated_cost_usd) : null,
    actualCostUsd:
      row.actual_cost_usd != null ? Number(row.actual_cost_usd) : null,
    status: row.status as AIUsageEventStatus,
    billableToUser: Boolean(row.billable_to_user),
    periodId: row.period_id != null ? String(row.period_id) : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function adminOrNull() {
  try {
    const { createSupabaseAdminClient } = await import(
      "../../supabase/admin.ts"
    );
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

export async function insertAIUsageEvent(
  input: StartAIUsageInput,
): Promise<AIUsageEvent> {
  const startedAt = (input.startedAt ?? new Date()).toISOString();
  const executionId = input.executionId ?? newId();
  const billableToUser =
    input.billableToUser ?? input.parentExecutionId == null;
  const event: AIUsageEvent = {
    id: newId(),
    userId: input.userId,
    workspaceId: input.workspaceId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    planId: input.planId,
    executionId,
    parentExecutionId: input.parentExecutionId ?? null,
    source: input.source,
    feature: input.feature ?? input.source,
    model: input.model ?? null,
    provider: input.provider ?? null,
    startedAt,
    endedAt: null,
    activeDurationMs: null,
    activeMinutes: null,
    estimatedCostUsd: input.estimatedCostUsd ?? null,
    actualCostUsd: null,
    status: "running",
    billableToUser,
    periodId: input.periodId ?? null,
    metadata: input.metadata ?? {},
    createdAt: startedAt,
  };

  const admin = await adminOrNull();
  if (!admin) {
    memory.events.set(executionId, event);
    return event;
  }

  const { data, error } = await admin
    .from("ai_usage_events")
    .insert({
      id: event.id,
      user_id: event.userId,
      workspace_id: event.workspaceId,
      subscription_id: event.subscriptionId,
      plan_id: event.planId,
      execution_id: event.executionId,
      parent_execution_id: event.parentExecutionId,
      source: event.source,
      feature: event.feature,
      model: event.model,
      provider: event.provider,
      started_at: event.startedAt,
      estimated_cost_usd: event.estimatedCostUsd,
      status: event.status,
      billable_to_user: event.billableToUser,
      period_id: event.periodId,
      metadata: event.metadata,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Idempotent retry if execution already started.
    const existing = await getAIUsageEventByExecutionId(executionId);
    if (existing) return existing;
    memory.events.set(executionId, event);
    return event;
  }
  return mapRow(data);
}

export async function getAIUsageEventByExecutionId(
  executionId: string,
): Promise<AIUsageEvent | null> {
  const mem = memory.events.get(executionId);
  if (mem) return mem;

  const admin = await adminOrNull();
  if (!admin) return null;

  const { data, error } = await admin
    .from("ai_usage_events")
    .select("*")
    .eq("execution_id", executionId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function completeAIUsageEvent(
  input: FinishAIUsageInput,
): Promise<AIUsageEvent | null> {
  const existing = await getAIUsageEventByExecutionId(input.executionId);
  if (!existing) return null;

  const endedAt = input.endedAt ?? new Date();
  const endedIso = endedAt.toISOString();
  const startMs = Date.parse(existing.startedAt);
  const endMs = endedAt.getTime();
  const durationMs = Math.max(0, endMs - startMs);
  const activeMinutes = msToMinutes(durationMs);

  const next: AIUsageEvent = {
    ...existing,
    endedAt: endedIso,
    activeDurationMs: durationMs,
    activeMinutes,
    status: input.status,
    model: input.model ?? existing.model,
    provider: input.provider ?? existing.provider,
    estimatedCostUsd:
      input.estimatedCostUsd ?? existing.estimatedCostUsd,
    actualCostUsd: input.actualCostUsd ?? existing.actualCostUsd,
    metadata: { ...existing.metadata, ...(input.metadata ?? {}) },
  };

  const admin = await adminOrNull();
  if (!admin) {
    memory.events.set(input.executionId, next);
    return next;
  }

  const { data, error } = await admin
    .from("ai_usage_events")
    .update({
      ended_at: next.endedAt,
      active_duration_ms: next.activeDurationMs,
      active_minutes: next.activeMinutes,
      status: next.status,
      model: next.model,
      provider: next.provider,
      estimated_cost_usd: next.estimatedCostUsd,
      actual_cost_usd: next.actualCostUsd,
      metadata: next.metadata,
    })
    .eq("execution_id", input.executionId)
    .select("*")
    .single();

  if (error || !data) {
    memory.events.set(input.executionId, next);
    return next;
  }
  const mapped = mapRow(data);
  memory.events.set(input.executionId, mapped);
  return mapped;
}

export async function listBillableIntervalsForPeriod(opts: {
  userId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  now?: Date;
}): Promise<{
  intervals: { startMs: number; endMs: number }[];
  estimatedCostUsd: number;
  actualCostUsd: number;
  eventCount: number;
}> {
  const nowMs = (opts.now ?? new Date()).getTime();
  const admin = await adminOrNull();

  let events: AIUsageEvent[] = [];
  if (admin) {
    const { data } = await admin
      .from("ai_usage_events")
      .select("*")
      .eq("user_id", opts.userId)
      .eq("period_id", opts.periodId)
      .eq("billable_to_user", true)
      .gte("started_at", opts.periodStart)
      .lt("started_at", opts.periodEnd);
    events = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  } else {
    events = [...memory.events.values()].filter(
      (row) =>
        row.userId === opts.userId &&
        row.periodId === opts.periodId &&
        row.billableToUser,
    );
  }

  const intervals = events.map((row) => {
    const startMs = Date.parse(row.startedAt);
    const endMs = row.endedAt ? Date.parse(row.endedAt) : nowMs;
    return { startMs, endMs: Math.max(startMs, endMs) };
  });

  let estimatedCostUsd = 0;
  let actualCostUsd = 0;
  for (const row of events) {
    estimatedCostUsd += row.estimatedCostUsd ?? 0;
    actualCostUsd += row.actualCostUsd ?? 0;
  }

  return {
    intervals,
    estimatedCostUsd,
    actualCostUsd,
    eventCount: events.length,
  };
}

export async function upsertPeriodAggregate(opts: {
  profileId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  planId: string;
  includedMinutes: number;
  usedBillableMs: number;
  usedMinutes: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  eventCount: number;
}): Promise<void> {
  const admin = await adminOrNull();
  if (!admin) return;

  await admin.from("ai_usage_period_aggregates").upsert(
    {
      profile_id: opts.profileId,
      period_id: opts.periodId,
      period_start: opts.periodStart,
      period_end: opts.periodEnd,
      plan_id: opts.planId,
      included_minutes: opts.includedMinutes,
      used_billable_ms: opts.usedBillableMs,
      used_minutes: opts.usedMinutes,
      estimated_cost_usd: opts.estimatedCostUsd,
      actual_cost_usd: opts.actualCostUsd,
      event_count: opts.eventCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "period_id" },
  );
}

export async function readPeriodAggregate(periodId: string): Promise<{
  usedBillableMs: number;
  usedMinutes: number;
  includedMinutes: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  planId: string;
  periodStart: string;
  periodEnd: string;
} | null> {
  const admin = await adminOrNull();
  if (!admin) return null;
  const { data, error } = await admin
    .from("ai_usage_period_aggregates")
    .select("*")
    .eq("period_id", periodId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    usedBillableMs: Number(data.used_billable_ms ?? 0),
    usedMinutes: Number(data.used_minutes ?? 0),
    includedMinutes: Number(data.included_minutes ?? 0),
    estimatedCostUsd: Number(data.estimated_cost_usd ?? 0),
    actualCostUsd: Number(data.actual_cost_usd ?? 0),
    planId: String(data.plan_id),
    periodStart: String(data.period_start),
    periodEnd: String(data.period_end),
  };
}

/** Test helper — clear in-memory ledger. */
export function resetAIUsageMemoryStore() {
  memory.events.clear();
}

export function computeMergedBillableMs(
  intervals: { startMs: number; endMs: number }[],
): number {
  return mergeIntervalsDurationMs(intervals);
}
