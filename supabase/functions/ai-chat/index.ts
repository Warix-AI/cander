/**
 * Authenticated private AI chat Edge Function.
 * Calls CANDER_AI_BRIDGE_URL (HTTPS tunnel only) — never localhost.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MODEL = "llama3.2";
const PROVIDER = "ollama-bridge";

type Json = Record<string, unknown>;

type SendPayload = {
  action:
    | "list_chats"
    | "create_chat"
    | "rename_chat"
    | "delete_chat"
    | "list_messages"
    | "send_message"
    | "set_context";
  chatId?: string;
  title?: string;
  content?: string;
  workspaceId?: string | null;
  contextRefs?: Array<{
    kind: string;
    id: string;
    workspaceId?: string | null;
  }>;
};

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

function isLocalOrPrivateUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }
    if (host.endsWith(".local")) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
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

    const payload = (await req.json()) as SendPayload;
    const action = payload.action;

    if (action === "list_chats") {
      const { data, error } = await supabase
        .from("ai_chats")
        .select("*")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return json(200, { chats: data ?? [] });
    }

    if (action === "create_chat") {
      const id = newId("aic");
      const now = new Date().toISOString();
      let row = {
        id,
        owner_id: user.id,
        workspace_id: payload.workspaceId ?? null,
        title: payload.title?.trim() || "New chat",
        created_at: now,
        updated_at: now,
      };
      let { data, error } = await supabase
        .from("ai_chats")
        .insert(row)
        .select("*")
        .single();
      // Invalid/foreign workspace id should not block chat creation.
      if (error && row.workspace_id) {
        row = { ...row, workspace_id: null };
        ({ data, error } = await supabase
          .from("ai_chats")
          .insert(row)
          .select("*")
          .single());
      }
      if (error) throw error;

      if (payload.contextRefs?.length) {
        try {
          await upsertContextRefs(supabase, user.id, id, payload.contextRefs);
        } catch (refErr) {
          console.error("[ai-chat] context refs skipped", refErr);
        }
      }
      return json(200, { chat: data });
    }

    if (action === "rename_chat") {
      if (!payload.chatId || !payload.title?.trim()) {
        return json(400, { error: "chatId and title required" });
      }
      const { data, error } = await supabase
        .from("ai_chats")
        .update({ title: payload.title.trim() })
        .eq("id", payload.chatId)
        .eq("owner_id", user.id)
        .select("*")
        .single();
      if (error) throw error;
      return json(200, { chat: data });
    }

    if (action === "delete_chat") {
      if (!payload.chatId) return json(400, { error: "chatId required" });
      const { error } = await supabase
        .from("ai_chats")
        .delete()
        .eq("id", payload.chatId)
        .eq("owner_id", user.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (action === "list_messages") {
      if (!payload.chatId) return json(400, { error: "chatId required" });
      const { data: chat } = await supabase
        .from("ai_chats")
        .select("id")
        .eq("id", payload.chatId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!chat) return json(404, { error: "Chat not found" });

      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("*")
        .eq("chat_id", payload.chatId)
        .eq("owner_id", user.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return json(200, { messages: data ?? [] });
    }

    if (action === "set_context") {
      if (!payload.chatId) return json(400, { error: "chatId required" });
      const { data: chat } = await supabase
        .from("ai_chats")
        .select("id")
        .eq("id", payload.chatId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!chat) return json(404, { error: "Chat not found" });

      await supabase
        .from("ai_chat_context_refs")
        .delete()
        .eq("chat_id", payload.chatId)
        .eq("owner_id", user.id);

      if (payload.contextRefs?.length) {
        await upsertContextRefs(
          supabase,
          user.id,
          payload.chatId,
          payload.contextRefs,
        );
      }
      return json(200, { ok: true });
    }

    if (action === "send_message") {
      if (!payload.chatId || !payload.content?.trim()) {
        return json(400, { error: "chatId and content required" });
      }

      const { data: chat, error: chatError } = await supabase
        .from("ai_chats")
        .select("*")
        .eq("id", payload.chatId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (chatError) throw chatError;
      if (!chat) return json(404, { error: "Chat not found" });

      const { data: existing, error: msgErr } = await supabase
        .from("ai_chat_messages")
        .select("sort_order")
        .eq("chat_id", payload.chatId)
        .eq("owner_id", user.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (msgErr) throw msgErr;
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const userMsgId = newId("aim");
      const now = new Date().toISOString();
      const userRow = {
        id: userMsgId,
        chat_id: payload.chatId,
        owner_id: user.id,
        role: "user",
        content: payload.content.trim(),
        status: "complete",
        sort_order: nextOrder,
        error: null,
        created_at: now,
      };
      const { error: insertUserErr } = await supabase
        .from("ai_chat_messages")
        .insert(userRow);
      if (insertUserErr) throw insertUserErr;

      const { data: history } = await supabase
        .from("ai_chat_messages")
        .select("role, content")
        .eq("chat_id", payload.chatId)
        .eq("owner_id", user.id)
        .order("sort_order", { ascending: true });

      const contextText = await resolveContextText(
        supabase,
        user.id,
        payload.chatId,
      );

      const bridgeUrl = (Deno.env.get("CANDER_AI_BRIDGE_URL") ?? "").replace(
        /\/$/,
        "",
      );
      const bridgeSecret = Deno.env.get("CANDER_AI_BRIDGE_SECRET") ?? "";

      let assistantContent = "";
      let status = "complete";
      let errorText: string | null = null;

      try {
        if (!bridgeUrl || !bridgeSecret) {
          throw new Error("AI bridge is not configured");
        }
        if (!bridgeUrl.startsWith("https://") || isLocalOrPrivateUrl(bridgeUrl)) {
          throw new Error(
            "CANDER_AI_BRIDGE_URL must be a public HTTPS tunnel hostname",
          );
        }

        const messages = (history ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        }));
        if (contextText) {
          messages.unshift({ role: "system", content: contextText });
        }

        const bridgeRes = await fetch(`${bridgeUrl}/v1/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bridgeSecret}`,
          },
          body: JSON.stringify({ model: MODEL, messages }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!bridgeRes.ok) {
          const detail = await bridgeRes.text().catch(() => "");
          throw new Error(
            bridgeRes.status === 401
              ? "AI bridge rejected credentials"
              : detail || `AI bridge error (${bridgeRes.status})`,
          );
        }
        const data = (await bridgeRes.json()) as { content?: string };
        assistantContent = data.content?.trim() || "(empty reply)";
      } catch (err) {
        status = "error";
        errorText =
          err instanceof Error ? err.message : "AI bridge unavailable";
        assistantContent =
          "I couldn't reach the AI bridge. Check that Ollama, the local bridge, and the HTTPS tunnel are running.";
      }

      const assistantId = newId("aim");
      const assistantRow = {
        id: assistantId,
        chat_id: payload.chatId,
        owner_id: user.id,
        role: "assistant",
        content: assistantContent,
        status,
        sort_order: nextOrder + 1,
        error: errorText,
        created_at: new Date().toISOString(),
      };
      const { error: insertAsstErr } = await supabase
        .from("ai_chat_messages")
        .insert(assistantRow);
      if (insertAsstErr) throw insertAsstErr;

      await supabase.from("ai_audit_events").insert({
        id: newId("aie"),
        owner_id: user.id,
        chat_id: payload.chatId,
        action: "send_message",
        provider: PROVIDER,
        status: status === "complete" ? "ok" : "error",
        detail: {
          model: MODEL,
          error: errorText,
        },
        created_at: new Date().toISOString(),
      });

      return json(200, {
        userMessage: userRow,
        assistantMessage: assistantRow,
        offline: status === "error",
      });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (err) {
    console.error("[ai-chat]", err);
    return json(500, {
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

async function upsertContextRefs(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  chatId: string,
  refs: Array<{ kind: string; id: string; workspaceId?: string | null }>,
) {
  const rows = [];
  for (const ref of refs) {
    const authorized = await authorizeRef(supabase, ownerId, ref);
    if (!authorized.ok) {
      throw new Error(authorized.error ?? "Invalid context reference");
    }
    rows.push({
      id: newId("acr"),
      chat_id: chatId,
      owner_id: ownerId,
      workspace_id: authorized.workspaceId,
      ref_kind: ref.kind,
      ref_id: ref.id,
      meta: authorized.meta,
      created_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("ai_chat_context_refs").insert(rows);
    if (error) throw error;
  }
}

async function authorizeRef(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  _ownerId: string,
  ref: { kind: string; id: string; workspaceId?: string | null },
): Promise<{
  ok: boolean;
  error?: string;
  workspaceId: string | null;
  meta: Record<string, string> | null;
}> {
  if (ref.kind === "project" || ref.kind === "research" || ref.kind === "automation") {
    const { data: project } = await supabase
      .from("projects")
      .select("id, title, kind, space_id, workspace_id")
      .eq("id", ref.id)
      .maybeSingle();
    if (!project) return { ok: false, error: "Invalid context reference", workspaceId: null, meta: null };
    // RLS: if the user isn't a workspace member, select returns null.
    return {
      ok: true,
      workspaceId: project.workspace_id,
      meta: {
        title: project.title,
        kind: project.kind,
        space: project.space_id,
      },
    };
  }
  if (ref.kind === "source") {
    const { data: source } = await supabase
      .from("sources")
      .select("id, title, workspace_id")
      .eq("id", ref.id)
      .maybeSingle();
    if (!source) return { ok: false, error: "Invalid context reference", workspaceId: null, meta: null };
    return {
      ok: true,
      workspaceId: source.workspace_id,
      meta: { title: source.title },
    };
  }
  if (ref.kind === "workspace") {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", ref.id)
      .maybeSingle();
    if (!ws) return { ok: false, error: "Invalid context reference", workspaceId: null, meta: null };
    return {
      ok: true,
      workspaceId: ws.id,
      meta: { title: ws.name },
    };
  }
  return { ok: false, error: "Unsupported context kind", workspaceId: null, meta: null };
}

async function resolveContextText(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  chatId: string,
): Promise<string | null> {
  const { data: refs } = await supabase
    .from("ai_chat_context_refs")
    .select("*")
    .eq("chat_id", chatId)
    .eq("owner_id", ownerId);
  if (!refs?.length) return null;
  const lines = refs.map(
    (r: { ref_kind: string; ref_id: string; meta: Record<string, string> | null }) => {
      const title = r.meta?.title ?? r.ref_id;
      const kind = r.meta?.kind ?? r.ref_kind;
      return `- ${r.ref_kind}: ${title} (${kind})`;
    },
  );
  return [
    "The user is viewing the following authorized workspace context:",
    ...lines,
    "Use this context only; do not invent access to other workspace data.",
  ].join("\n");
}
