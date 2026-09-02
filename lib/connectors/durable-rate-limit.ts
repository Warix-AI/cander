/**
 * Durable connector rate limits via usage_window_counters (migration 038).
 */

import { createSupabaseAdminClient } from "../supabase/admin.ts";
import { windowStartIso } from "@/lib/usage/window.ts";

export type ConnectorRateCategory =
  | "connector_initiate"
  | "connector_callback"
  | "connector_disconnect"
  | "connector_webhook"
  | "connector_tool_execute"
  | "connector_read";

const LIMITS: Record<ConnectorRateCategory, { perMinute: number }> = {
  connector_initiate: { perMinute: 10 },
  connector_callback: { perMinute: 20 },
  connector_disconnect: { perMinute: 10 },
  connector_webhook: { perMinute: 120 },
  connector_tool_execute: { perMinute: 30 },
  connector_read: { perMinute: 60 },
};

export async function checkConnectorRateLimitDurable(input: {
  category: ConnectorRateCategory;
  workspaceId: string;
  profileId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: 429; error: string }
> {
  const limit = LIMITS[input.category]?.perMinute;
  if (!limit) return { ok: true };

  try {
    const admin = createSupabaseAdminClient();
    const windowStart = windowStartIso("minute");
    const { data: before, error: readError } = await admin
      .from("usage_window_counters")
      .select("request_count")
      .eq("workspace_id", input.workspaceId)
      .eq("profile_id", input.profileId)
      .eq("feature_category", input.category)
      .eq("window_kind", "minute")
      .eq("window_start", windowStart)
      .maybeSingle();
    if (readError) throw readError;
    if ((before?.request_count ?? 0) >= limit) {
      return {
        ok: false,
        status: 429,
        error: "Too many requests. Try again shortly.",
      };
    }

    const { error: incError } = await admin.rpc("increment_usage_window_counter", {
      p_workspace_id: input.workspaceId,
      p_profile_id: input.profileId,
      p_feature_category: input.category,
      p_window_kind: "minute",
      p_window_start: windowStart,
      p_request_delta: 1,
      p_units_delta: 0,
      p_cost_micros_delta: 0,
    });
    if (incError) throw incError;
    return { ok: true };
  } catch {
    const { checkConnectorRateLimit } = await import("./rate-limit.ts");
    return checkConnectorRateLimit(
      `${input.category}:${input.workspaceId}:${input.profileId}`,
    );
  }
}
