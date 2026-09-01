/**
 * Edge Agent API — canonical TurnOrchestrator entry.
 * Actions: run_turn | run_turn_stream | cancel_turn | get_turn
 * Default: Orchestrator V2. Set AI_ORCHESTRATOR_V2=0 for V1.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveModelProvider } from "../_shared/agent/model-provider.ts";
import { runTurnOrchestrator } from "../_shared/agent/orchestrator.ts";
import {
  isOrchestratorV2Enabled,
  runTurnOrchestratorV2,
  type StreamEvent,
} from "../_shared/agent/v2/orchestrator.ts";
import { guardEdgeAiChatUsage } from "../_shared/usage-guard.ts";

type Json = Record<string, unknown>;

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    ...extra,
  };
}

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function parseRunTurnBody(body: Record<string, unknown>) {
  const turnId = String(body?.turnId ?? "").trim();
  const chatId = String(body?.chatId ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const images = Array.isArray(body?.images)
    ? body.images.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const workspaceKnowledgeHits = Array.isArray(body?.workspaceKnowledgeHits)
    ? body.workspaceKnowledgeHits
    : [];
  const clientActionResults = Array.isArray(body?.clientActionResults)
    ? body.clientActionResults
    : undefined;
  const useV2 =
    body?.orchestratorVersion === "v1"
      ? false
      : body?.orchestratorVersion === "v2"
        ? true
        : isOrchestratorV2Enabled();
  return {
    turnId,
    chatId,
    content,
    images,
    workspaceKnowledgeHits,
    clientActionResults,
    researchMode: Boolean(body?.researchMode),
    locationHint:
      typeof body?.locationHint === "string" ? body.locationHint : null,
    userTimezone:
      typeof body?.userTimezone === "string" ? body.userTimezone : null,
    useV2,
    inferenceProvider: body?.inferenceProvider,
  };
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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

    if (action === "run_turn" || action === "run_turn_stream") {
      const parsed = parseRunTurnBody(body);
      if (!parsed.turnId || !parsed.chatId || !parsed.content) {
        return json(400, { error: "turnId, chatId, and content required" });
      }

      const { data: chatRow } = await supabase
        .from("ai_chats")
        .select("workspace_id")
        .eq("id", parsed.chatId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!chatRow?.workspace_id) {
        return json(404, { error: "Chat not found" });
      }
      const usage = await guardEdgeAiChatUsage({
        workspaceId: String(chatRow.workspace_id),
        profileId: user.id,
      });
      if (!usage.ok) {
        return json(usage.status, { error: usage.error });
      }

      let provider;
      try {
        provider = resolveModelProvider(parsed.inferenceProvider as string | undefined);
      } catch (e) {
        return json(503, {
          error: e instanceof Error ? e.message : "Provider unavailable",
        });
      }

      const stream = action === "run_turn_stream";

      if (stream && parsed.useV2) {
        const encoder = new TextEncoder();
        let closed = false;
        const readable = new ReadableStream<Uint8Array>({
          async start(controller) {
            const write = (ev: StreamEvent) => {
              if (closed) return;
              controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
            };
            try {
              const result = await runTurnOrchestratorV2(
                {
                  supabase,
                  ownerId: user.id,
                  provider,
                  onEvent: write,
                },
                {
                  turnId: parsed.turnId,
                  chatId: parsed.chatId,
                  content: parsed.content,
                  images: parsed.images,
                  workspaceKnowledgeHits: parsed.workspaceKnowledgeHits,
                  researchMode: parsed.researchMode,
                  clientActionResults: parsed.clientActionResults,
                  locationHint: parsed.locationHint,
                  userTimezone: parsed.userTimezone,
                },
              );
              // Ensure terminal event even if orchestrator forgot
              if (result.status === "paused_for_client") {
                write({ type: "turn.paused", result });
              } else if (result.status === "cancelled") {
                write({ type: "turn.cancelled", turnId: parsed.turnId });
              } else if (result.status === "failed") {
                write({
                  type: "turn.failed",
                  error: "turn_failed",
                  result,
                });
              } else {
                write({ type: "turn.completed", result });
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Internal error";
              write({ type: "turn.failed", error: message });
            } finally {
              closed = true;
              try {
                controller.close();
              } catch {
                // ignore
              }
            }
          },
        });

        return new Response(readable, {
          status: 200,
          headers: corsHeaders({
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Content-Type-Options": "nosniff",
          }),
        });
      }

      // Non-streaming (V2 or V1)
      if (parsed.useV2) {
        const result = await runTurnOrchestratorV2(
          { supabase, ownerId: user.id, provider },
          {
            turnId: parsed.turnId,
            chatId: parsed.chatId,
            content: parsed.content,
            images: parsed.images,
            workspaceKnowledgeHits: parsed.workspaceKnowledgeHits,
            researchMode: parsed.researchMode,
            clientActionResults: parsed.clientActionResults,
            locationHint: parsed.locationHint,
            userTimezone: parsed.userTimezone,
          },
        );
        return json(200, result);
      }

      const result = await runTurnOrchestrator(
        { supabase, ownerId: user.id, provider, authHeader },
        {
          turnId: parsed.turnId,
          chatId: parsed.chatId,
          content: parsed.content,
          images: parsed.images,
          workspaceKnowledgeHits: parsed.workspaceKnowledgeHits,
          researchMode: parsed.researchMode,
          clientActionResults: parsed.clientActionResults,
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
