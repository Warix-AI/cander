import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import type {
  UsageAuditEntry,
  UsageStore,
  ReserveUsageInput,
  StoredUsageEvent,
  WindowCounter,
} from "./memory-store.ts";
import type { UsageReconcileInput, UsageWindowKind } from "../types.ts";

function emptyCounter(): WindowCounter {
  return { requestCount: 0, units: 0, costMicros: 0 };
}

export function createPostgresUsageStore(): UsageStore | null {
  try {
    const admin = createSupabaseAdminClient();
    return new PostgresUsageStore(admin);
  } catch {
    return null;
  }
}

class PostgresUsageStore implements UsageStore {
  private admin: ReturnType<typeof createSupabaseAdminClient>;

  constructor(admin: ReturnType<typeof createSupabaseAdminClient>) {
    this.admin = admin;
  }

  async reserve(input: ReserveUsageInput): Promise<StoredUsageEvent> {
    const { data, error } = await this.admin
      .from("usage_events")
      .upsert(
        {
          idempotency_key: input.idempotencyKey,
          workspace_id: input.workspaceId,
          profile_id: input.profileId,
          feature_category: input.feature,
          provider: input.provider ?? null,
          model: input.model ?? null,
          units: input.units,
          unit_kind: input.unitKind,
          estimated_cost_micros: input.estimatedCostMicros,
          status: "reserved",
          metadata: input.metadata ?? {},
        },
        { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: false },
      )
      .select("*")
      .single();
    if (error) throw error;
    return mapEvent(data);
  }

  async reconcile(input: UsageReconcileInput): Promise<StoredUsageEvent | null> {
    const { data, error } = await this.admin
      .from("usage_events")
      .update({
        status: input.status,
        actual_cost_micros: input.actualCostMicros ?? null,
        units: input.actualUnits ?? undefined,
        provider: input.provider ?? undefined,
        model: input.model ?? undefined,
        metadata: input.metadata ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.reservationId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? mapEvent(data) : null;
  }

  async getWindowCounter(input: {
    workspaceId: string;
    profileId: string | null;
    feature: import("../types").UsageFeatureCategory;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<WindowCounter> {
    const { data } = await this.admin
      .from("usage_window_counters")
      .select("request_count, units, cost_micros")
      .eq("workspace_id", input.workspaceId)
      .eq("profile_id", input.profileId ?? "")
      .eq("feature_category", input.feature)
      .eq("window_kind", input.windowKind)
      .eq("window_start", input.windowStart)
      .maybeSingle();
    if (!data) return emptyCounter();
    return {
      requestCount: Number(data.request_count ?? 0),
      units: Number(data.units ?? 0),
      costMicros: Number(data.cost_micros ?? 0),
    };
  }

  async incrementWindowCounter(input: {
    workspaceId: string;
    profileId: string | null;
    feature: import("../types").UsageFeatureCategory;
    windowKind: UsageWindowKind;
    windowStart: string;
    requestDelta?: number;
    unitsDelta?: number;
    costMicrosDelta?: number;
  }): Promise<WindowCounter> {
    const { data, error } = await this.admin.rpc("increment_usage_window_counter", {
      p_workspace_id: input.workspaceId,
      p_profile_id: input.profileId ?? "",
      p_feature_category: input.feature,
      p_window_kind: input.windowKind,
      p_window_start: input.windowStart,
      p_request_delta: input.requestDelta ?? 0,
      p_units_delta: input.unitsDelta ?? 0,
      p_cost_micros_delta: input.costMicrosDelta ?? 0,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      requestCount: Number(row?.request_count ?? 0),
      units: Number(row?.units ?? 0),
      costMicros: Number(row?.cost_micros ?? 0),
    };
  }

  async countActiveReservations(input: {
    workspaceId: string;
    feature: import("../types").UsageFeatureCategory;
  }): Promise<number> {
    const { count } = await this.admin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", input.workspaceId)
      .eq("feature_category", input.feature)
      .eq("status", "reserved");
    return count ?? 0;
  }

  async sumWorkspaceCost(input: {
    workspaceId: string;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number> {
    void input.windowKind;
    const { data } = await this.admin
      .from("usage_events")
      .select("estimated_cost_micros, actual_cost_micros, status")
      .eq("workspace_id", input.workspaceId)
      .gte("created_at", input.windowStart)
      .neq("status", "released");
    return (data ?? []).reduce(
      (sum, row) =>
        sum +
        Number(
          row.actual_cost_micros ?? row.estimated_cost_micros ?? 0,
        ),
      0,
    );
  }

  async sumUserExpensiveCost(input: {
    profileId: string;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number> {
    void input.windowKind;
    const { data } = await this.admin
      .from("usage_events")
      .select("estimated_cost_micros, actual_cost_micros, status, feature_category")
      .eq("profile_id", input.profileId)
      .gte("created_at", input.windowStart)
      .neq("status", "released");
    const expensive = new Set([
      "image_generation",
      "audio_realtime",
      "coding_agent",
      "sandbox_runtime",
      "sandbox_build",
      "sandbox_deploy",
      "video_generation",
    ]);
    return (data ?? [])
      .filter((row) => expensive.has(String(row.feature_category)))
      .reduce(
        (sum, row) =>
          sum +
          Number(
            row.actual_cost_micros ?? row.estimated_cost_micros ?? 0,
          ),
        0,
      );
  }

  async sumGlobalCost(input: {
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number> {
    void input.windowKind;
    const { data } = await this.admin
      .from("usage_events")
      .select("estimated_cost_micros, actual_cost_micros, status")
      .gte("created_at", input.windowStart)
      .neq("status", "released");
    return (data ?? []).reduce(
      (sum, row) =>
        sum +
        Number(
          row.actual_cost_micros ?? row.estimated_cost_micros ?? 0,
        ),
      0,
    );
  }

  async writeAudit(entry: Omit<UsageAuditEntry, "id" | "createdAt">): Promise<void> {
    await this.admin.from("usage_audit_log").insert({
      workspace_id: entry.workspaceId,
      profile_id: entry.profileId,
      feature_category: entry.feature,
      decision: entry.decision,
      reason: entry.reason,
      metadata: entry.metadata,
    });
  }
}

function mapEvent(row: Record<string, unknown>): StoredUsageEvent {
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    workspaceId: String(row.workspace_id),
    profileId: String(row.profile_id),
    feature: row.feature_category as StoredUsageEvent["feature"],
    provider: row.provider ? String(row.provider) : null,
    model: row.model ? String(row.model) : null,
    units: Number(row.units ?? 0),
    unitKind: row.unit_kind as StoredUsageEvent["unitKind"],
    estimatedCostMicros: Number(row.estimated_cost_micros ?? 0),
    actualCostMicros:
      row.actual_cost_micros == null
        ? null
        : Number(row.actual_cost_micros),
    status: row.status as StoredUsageEvent["status"],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
