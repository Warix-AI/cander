/**
 * Edge Agent API — canonical TurnOrchestrator entry.
 * Actions: run_turn | cancel_turn | get_turn
 * Default: Orchestrator V2 (bounded autonomous loop). Set AI_ORCHESTRATOR_V2=0 for V1.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveModelProvider } from "../_shared/agent/model-provider.ts";
import { runTurnOrchestrator } from "../_shared/agent/orchestrator.ts";
import {
  isOrchestratorV2Enabled,
  runTurnOrchestratorV2,
} from "../_shared/agent/v2/orchestrator.ts";

type Json = Record<string, unknown>;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Missing authorization" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return json(401, { error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "run_turn");

    if (action === "cancel_turn") {
      const turnId = String(body?.turnId ?? "").trim();
      if (!turnId) return json(400, { error: "turnId required" });
      const { data, error } = await supabase
        .from("ai_chat_turns")
        .update({
          cancel_requested: true,
          updated_at: new Date().toISOString(),
        })
        .eq("turn_id", turnId)
        .eq("owner_id", user.id)
        .select("turn_id, status, cancel_requested")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Turn not found" });
      if (data.status === "pending" || data.status === "running") {
        await supabase
          .from("ai_chat_turns")
          .update({
            status: "cancelled",
            completed_at: new Date().toISOString(),
          })
          .eq("turn_id", turnId)
          .eq("owner_id", user.id)
          .in("status", ["pending", "running"]);
      }
      return json(200, { ok: true, turnId, cancel_requested: true });
    }

    if (action === "get_turn") {
      const turnId = String(body?.turnId ?? "").trim();
      if (!turnId) return json(400, { error: "turnId required" });
      const { data, error } = await supabase
        .from("ai_chat_turns")
        .select("*")
        .eq("turn_id", turnId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Turn not found" });
      return json(200, { turn: data });
    }

    if (action === "run_turn") {
      const turnId = String(body?.turnId ?? "").trim();
      const chatId = String(body?.chatId ?? "").trim();
      const content = String(body?.content ?? "").trim();
      if (!turnId || !chatId || !content) {
        return json(400, { error: "turnId, chatId, and content required" });
      }

      const images = Array.isArray(body?.images)
        ? body.images.filter((x: unknown): x is string => typeof x === "string")
        : [];
      const workspaceKnowledgeHits = Array.isArray(body?.workspaceKnowledgeHits)
        ? body.workspaceKnowledgeHits
        : [];
      const clientActionResults = Array.isArray(body?.clientActionResults)
        ? body.clientActionResults
        : undefined;

      let provider;
      try {
        provider = resolveModelProvider(body?.inferenceProvider);
      } catch (e) {
        return json(503, {
          error: e instanceof Error ? e.message : "Provider unavailable",
        });
      }

      const useV2 =
        body?.orchestratorVersion === "v1"
          ? false
          : body?.orchestratorVersion === "v2"
            ? true
            : isOrchestratorV2Enabled();

      if (useV2) {
        const result = await runTurnOrchestratorV2(
          { supabase, ownerId: user.id, provider },
          {
            turnId,
            chatId,
            content,
            images,
            workspaceKnowledgeHits,
            researchMode: Boolean(body?.researchMode),
            clientActionResults,
            locationHint:
              typeof body?.locationHint === "string" ? body.locationHint : null,
            userTimezone:
              typeof body?.userTimezone === "string" ? body.userTimezone : null,
          },
        );
        return json(200, result);
      }

      const result = await runTurnOrchestrator(
        { supabase, ownerId: user.id, provider, authHeader },
        {
          turnId,
          chatId,
          content,
          images,
          workspaceKnowledgeHits,
          researchMode: Boolean(body?.researchMode),
          clientActionResults,
        },
      );
      return json(200, result);
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (err) {
    console.error("[ai-agent]", err);
    return json(500, {
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});
