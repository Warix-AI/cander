import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type BriefingPayload = {
  workspaceId: string;
  connectorId?: string | null;
};

/**
 * Legacy synthetic briefing rows used demo titles (Northwind, Launch sync, …)
 * and were upserted on every sync — they appeared in Recents as “Just now”.
 * Production sync must not seed sample activity.
 */
const LEGACY_SYNTHETIC_SUFFIXES = [
  "northwind-reply",
  "slack-threads",
  "launch-sync",
  "vendor-invoice",
  "handshake-review",
] as const;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function scopedId(workspaceId: string, suffix: string) {
  const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return `brief-${safeWs}-${suffix}`.slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as BriefingPayload;
    const workspaceId = payload.workspaceId?.trim();
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspaceId required" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Purge legacy demo briefing rows so Recents / Work stay empty until real
    // connector activity exists. Do not insert sample templates.
    const legacyIds = LEGACY_SYNTHETIC_SUFFIXES.map((suffix) =>
      scopedId(workspaceId, suffix),
    );
    const { error: deleteError, count } = await supabase
      .from("briefing_items")
      .delete({ count: "exact" })
      .eq("workspace_id", workspaceId)
      .in("id", legacyIds);
    if (deleteError) throw deleteError;

    return new Response(
      JSON.stringify({
        ok: true,
        count: 0,
        removedSynthetic: count ?? 0,
      }),
      {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "briefing-sync failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
