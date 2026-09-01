/**
 * Edge usage guard for ai-agent / ai-chat — durable minute counters.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const FEATURE = "ai_chat";
const PER_MINUTE = 40;

function minuteWindowStartIso(): string {
  const now = new Date();
  now.setUTCSeconds(0, 0);
  return now.toISOString();
}

export async function guardEdgeAiChatUsage(input: {
  workspaceId: string;
  profileId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (Deno.env.get("USAGE_ENFORCEMENT_ENABLED")?.trim().toLowerCase() === "false") {
    return { ok: true };
  }
  if (
    Deno.env.get("USAGE_ENFORCEMENT_ENABLED") === "0" ||
    Deno.env.get("USAGE_ENFORCEMENT_ENABLED")?.toLowerCase() === "off"
  ) {
    return { ok: true };
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return { ok: true };

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const windowStart = minuteWindowStartIso();
  const { data: before, error: readError } = await admin
    .from("usage_window_counters")
    .select("request_count")
    .eq("workspace_id", input.workspaceId)
    .eq("profile_id", input.profileId)
    .eq("feature_category", FEATURE)
    .eq("window_kind", "minute")
    .eq("window_start", windowStart)
    .maybeSingle();
  if (readError) return { ok: true };
  if ((before?.request_count ?? 0) >= PER_MINUTE) {
    return {
      ok: false,
      status: 429,
      error: "Too many AI requests. Try again shortly.",
    };
  }

  const { error: incError } = await admin.rpc("increment_usage_window_counter", {
    p_workspace_id: input.workspaceId,
    p_profile_id: input.profileId,
    p_feature_category: FEATURE,
    p_window_kind: "minute",
    p_window_start: windowStart,
    p_request_delta: 1,
    p_units_delta: 0,
    p_cost_micros_delta: 0,
  });
  if (incError) return { ok: true };
  return { ok: true };
}
