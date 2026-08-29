/**
 * Authenticated private AI chat Edge Function.
 * Calls CANDER_AI_BRIDGE_URL (HTTPS tunnel only) — never localhost.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MODEL = "llama3.2";
const PROVIDER = "ollama-bridge";
/** Verbatim turns after the condensation watermark (short-term continuity). */
const RECENT_MESSAGE_LIMIT = 25;
/** Condense when this many messages pile up past the watermark. */
const CONDENSE_MESSAGE_THRESHOLD = 25;
const CONDENSE_CHAR_THRESHOLD = 8_000;

const PRODUCT_SYSTEM_PROMPT = `Be a warm, concise, practical conversational assistant. Answer what the user just said — like ChatGPT in a normal chat, not a product demo.

Default: reply in plain language. No tools. No JSON. No project/workspace digressions unless the user asked about their app or workspace.
Greetings, brainstorming, opinions, questions, and follow-ups → answer immediately.
Never volunteer identity, provider, model name, Apple Intelligence, Foundation Models, Cander AI branding, or “I’m powered by…”. Do not start with “I’m…”.
Only discuss identity/model when the user directly asks — then say briefly you are Cander’s in-app assistant.
Continue the active conversation. Prefer short, clear replies.
Answer the question first. Prefer short paragraphs and high information density.
Do not restate the user's request. Avoid unnecessary headings and filler.
You may use Markdown; the UI will render it.
Long conversations are summarized into condensed memory. Prefer that memory plus recent messages.
If prior turns exist, do not greet or restate identity — answer directly.
Never put tool names, raw JSON, or “Calling tool…” in the user-visible reply — only a short human sentence, then optionally one trailing tool JSON object when tools are listed for this turn.

Tool protocol (only if tools are listed below for this turn):
{"tool":"<name>","arguments":{...}}
- Never invent workspace_id or UUIDs.
- Never call workspace.search for trivia or small talk.
- Never invent tools that are not listed. Complex coding/research → create_work_task only.
- One JSON object only. No trailing commas.`;

const NO_REGREET_SYSTEM = `This conversation already has prior turns, condensed memory, or an active task. Do not greet, re-introduce yourself, or mention identity, model, or provider. Answer the latest user message directly. Continue the same task — do not restart.`;

const NO_TOOLS_THIS_TURN =
  "No tools are available for this turn. Answer in plain language only. Do not emit JSON tool calls.";

const KNOWN_TOOLS_RE =
  "nav\\.open|project\\.(?:create|open)|panel\\.(?:open|close)|workspace\\.search|ui\\.(?:ask_clarification|confirm)|create_work_task";

const EDGE_TOOL_LINES: Record<string, string> = {
  "nav.open":
    '- nav.open: { "target": "new_chat"|"work"|"build"|"research"|"recents"|"connectors"|"settings", "settingsTab"?: string }',
  "panel.open": '- panel.open: { "projectId"?: string, "mode"?: string }',
  "panel.close": "- panel.close: {}",
  "project.create":
    '- project.create: { "title": string, "space"?: "build"|"research"|"work", "kind"?: string, "summary"?: string }',
  "project.open": '- project.open: { "projectId": string }',
  "workspace.search": '- workspace.search: { "query": string }',
  "ui.ask_clarification":
    '- ui.ask_clarification: { "title": string, "description"?: string, "questions": array, "resumeTool"?: string, "resumeArguments"?: object }',
  "ui.confirm":
    '- ui.confirm: { "title": string, "message": string, "confirmLabel"?: string }',
  create_work_task:
    '- create_work_task: { "title": string, "goal": string, "kind": "coding"|"research"|"multi_step", "summary"?: string }',
};

const TOOL_DOMAINS: Record<string, string[]> = {
  clarification: ["ui.ask_clarification", "ui.confirm"],
  navigation: ["nav.open", "panel.open", "panel.close"],
  projects: ["project.create", "project.open"],
  search: ["workspace.search"],
  cloud_work: ["create_work_task"],
};

function isConversationOnlyTurnEdge(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (
    /^(hi|hey|hello|yo|sup|howdy)\b/i.test(t) ||
    /\bhow('?s| is| are) (it|things|everything|you)\b/i.test(t) ||
    /\bhow (fast|tall|old|big|long|many|much|far)\b/i.test(t) ||
    /\bwhat (is|are|was|were|does|do|did|can)\b/i.test(t) ||
    /\bwho (is|are|was|were)\b/i.test(t) ||
    /\bwhy (is|are|do|does|did|can)\b/i.test(t) ||
    /\bexplain\b|\btell me about\b|\bdefine\b/i.test(t)
  ) {
    if (
      !/\b(create|make|new)\b[\s\S]{0,40}\bproject\b/i.test(t) &&
      !/\b(open|go to|take me|navigate)\b/i.test(t)
    ) {
      return true;
    }
  }
  if (
    t.length < 160 &&
    !/\b(project|workspace|build|explore|connector|settings|panel|preview)\b/i.test(
      t,
    ) &&
    (/[?]/.test(t) ||
      /^(how|what|who|why|when|where|can|could|should|is|are|do|does)\b/i.test(t))
  ) {
    return true;
  }
  return false;
}

function isComplexWorkIntentEdge(text: string): boolean {
  const t = text.trim();
  if (
    /\b(create|make|new)\b[\s\S]{0,40}\bproject\b/i.test(t) &&
    !/\b(implement|code|tests?|refactor)\b/i.test(t)
  ) {
    return false;
  }
  return (
    /\b(implement|refactor|write tests?|codebase|pull request)\b/i.test(t) ||
    /\b(build|develop|ship)\b[\s\S]{0,48}\b(app|feature|api|auth)\b/i.test(t) ||
    /\bresearch (and|&) (compare|analyze)\b/i.test(t) ||
    (t.length > 220 && /\b(code|implement|debug|typescript|react)\b/i.test(t))
  );
}

function resolveAllowedToolsEdge(content: string): string[] {
  const domains = new Set<string>();
  const t = content.trim();
  if (isComplexWorkIntentEdge(t)) {
    domains.add("cloud_work");
  } else if (
    /\b(create|make|new|start)\b[\s\S]{0,40}\bproject\b/i.test(t) ||
    /\bproject\b[\s\S]{0,40}\b(create|make|new)\b/i.test(t)
  ) {
    domains.add("projects");
    domains.add("clarification");
  } else if (
    /\b(open|go to|take me|navigate|switch to|show me)\b/i.test(t) ||
    /\btake me there\b/i.test(t)
  ) {
    domains.add("navigation");
    if (/\bproject\b/i.test(t)) {
      domains.add("search");
      domains.add("projects");
    }
  } else if (
    /\b(search|find|list)\b[\s\S]{0,40}\b(my |the )?(projects?|workspace)\b/i.test(
      t,
    )
  ) {
    domains.add("search");
    domains.add("projects");
  } else if (isConversationOnlyTurnEdge(t)) {
    return [];
  } else {
    return [];
  }
  const names = new Set<string>();
  for (const d of domains) {
    for (const n of TOOL_DOMAINS[d] ?? []) names.add(n);
  }
  return [...names];
}

function formatEdgeToolCatalog(toolNames: string[]): string {
  if (!toolNames.length) return NO_TOOLS_THIS_TURN;
  const lines = toolNames.map((n) => EDGE_TOOL_LINES[n]).filter(Boolean);
  if (!lines.length) return NO_TOOLS_THIS_TURN;
  return ["Available tools and arguments for this turn:", ...lines].join("\n");
}

/** Strip tool/JSON chrome before persisting or feeding condensation. */
function sanitizeAssistantVisibleText(content: string): string {
  let text = (content || "").trim();
  if (!text) return "";
  text = text.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, "");
  text = text.replace(
    /\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*/g,
    "",
  );
  text = text.replace(
    /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|args)"\s*:\s*\{[\s\S]*?\}\s*\}\s*/g,
    "",
  );
  text = text.replace(
    new RegExp(
      `\\{\\s*"(?:${KNOWN_TOOLS_RE})"\\s*:\\s*\\{[\\s\\S]*?\\}\\s*\\}\\s*`,
      "gi",
    ),
    "",
  );
  text = text.replace(/\{\s*"error"\s*:\s*"[^"]*"\s*\}\s*/gi, "");
  text = text.replace(
    new RegExp(
      `\`?\\s*(?:${KNOWN_TOOLS_RE})\\s*\\{[\\s\\S]*?\\}\\s*\`?`,
      "gi",
    ),
    "",
  );
  text = text.replace(
    /^(?:calling|using|running|invoking)\s+tool[^\n]*$/gim,
    "",
  );
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^```/.test(t)) return false;
      if (t.startsWith("{") && /"(?:tool|arguments|error)"/.test(t)) return false;
      if (
        new RegExp(`^(?:${KNOWN_TOOLS_RE})\\b`, "i").test(t) &&
        t.includes("{")
      ) {
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function condensedIsActive(condensed: CondensedContext | null): boolean {
  if (!condensed) return false;
  return Object.values(condensed).some((v) => {
    if (typeof v === "string") return Boolean(v.trim());
    if (Array.isArray(v)) return v.length > 0;
    return false;
  });
}

function mergeCondensedSummaries(
  previousSummary: string | null | undefined,
  newlyCondensedTurns: string,
): string {
  const prev = (previousSummary ?? "").trim();
  const next = newlyCondensedTurns.trim();
  if (!prev) return next;
  if (!next) return prev;
  return [
    "Rolling conversation memory (merged):",
    "Prior summary:",
    prev,
    "",
    "Newly condensed turns (retain goals, names, decisions, pending questions):",
    next,
  ].join("\n");
}

function shouldSuppressReGreeting(opts: {
  turns: Array<{ role: string; content?: string | null }>;
  condensedActive?: boolean;
}): boolean {
  if (opts.condensedActive) return true;
  const meaningful = opts.turns.filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      Boolean(m.content?.trim()),
  );
  return meaningful.length > 1 || meaningful.some((m) => m.role === "assistant");
}

type Json = Record<string, unknown>;

type CondensedContext = {
  conversation_summary?: string;
  current_state?: string;
  decisions?: string[];
  open_tasks?: string[];
  important_entities?: string[];
  preferences_constraints?: string[];
  last_updated?: string;
};

type HistoryRow = {
  role: string;
  content: string;
  sort_order: number;
};

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
        .select("role, content, sort_order")
        .eq("chat_id", payload.chatId)
        .eq("owner_id", user.id)
        .order("sort_order", { ascending: true });

      const contextText = await resolveContextText(
        supabase,
        user.id,
        payload.chatId,
      );
      const userProfileText = await resolveUserProfileText(supabase, user.id);

      const bridgeUrl = (Deno.env.get("CANDER_AI_BRIDGE_URL") ?? "").replace(
        /\/$/,
        "",
      );
      const bridgeSecret = Deno.env.get("CANDER_AI_BRIDGE_SECRET") ?? "";

      let assistantContent = "";
      let status = "complete";
      let errorText: string | null = null;
      let condensationOccurred = false;

      try {
        if (!bridgeUrl || !bridgeSecret) {
          throw new Error("AI bridge is not configured");
        }
        if (!bridgeUrl.startsWith("https://") || isLocalOrPrivateUrl(bridgeUrl)) {
          throw new Error(
            "CANDER_AI_BRIDGE_URL must be a public HTTPS tunnel hostname",
          );
        }

        const historyRows = (history ?? []) as HistoryRow[];
        const watermark =
          typeof chat.condensed_through_sort_order === "number"
            ? chat.condensed_through_sort_order
            : -1;
        const condensed = (chat.condensed_context ?? null) as CondensedContext | null;
        const modelMessages = buildModelMessages({
          history: historyRows,
          watermark,
          condensed,
          contextText,
          userProfileText,
          latestUserContent: payload.content.trim(),
        });

        const bridgeRes = await fetch(`${bridgeUrl}/v1/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bridgeSecret}`,
          },
          body: JSON.stringify({ model: MODEL, messages: modelMessages }),
          signal: AbortSignal.timeout(45_000),
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

      // Client needs raw content (with trailing tool JSON) to parse/execute tools.
      // Persist sanitized prose only so Edge history / condensation never leak tools.
      const rawForClient = assistantContent;
      const storedContent =
        status === "complete"
          ? sanitizeAssistantVisibleText(assistantContent) ||
            "(empty reply)"
          : assistantContent;

      const assistantId = newId("aim");
      const assistantRow = {
        id: assistantId,
        chat_id: payload.chatId,
        owner_id: user.id,
        role: "assistant",
        content: storedContent,
        status,
        sort_order: nextOrder + 1,
        error: errorText,
        created_at: new Date().toISOString(),
      };
      const { error: insertAsstErr } = await supabase
        .from("ai_chat_messages")
        .insert(assistantRow);
      if (insertAsstErr) throw insertAsstErr;

      if (status === "complete" && bridgeUrl && bridgeSecret) {
        try {
          const { data: fullHistory } = await supabase
            .from("ai_chat_messages")
            .select("role, content, sort_order")
            .eq("chat_id", payload.chatId)
            .eq("owner_id", user.id)
            .order("sort_order", { ascending: true });

          const condensedResult = await maybeCondenseChat({
            bridgeUrl,
            bridgeSecret,
            supabase,
            chatId: payload.chatId,
            history: (fullHistory ?? []) as HistoryRow[],
            watermark:
              typeof chat.condensed_through_sort_order === "number"
                ? chat.condensed_through_sort_order
                : -1,
            existing: (chat.condensed_context ?? null) as CondensedContext | null,
          });
          condensationOccurred = condensedResult.occurred;
        } catch (condenseErr) {
          console.warn("[ai-chat] condensation skipped", condenseErr);
        }
      }

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
          condensationOccurred,
        },
        created_at: new Date().toISOString(),
      });

      return json(200, {
        userMessage: userRow,
        assistantMessage: { ...assistantRow, content: rawForClient },
        offline: status === "error",
        condensation: { occurred: condensationOccurred },
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

async function resolveUserProfileText(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, short_name, email, plan")
    .eq("id", userId)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("role, workspace_id, workspaces(id, name, kind)")
    .eq("profile_id", userId)
    .limit(20);

  const preferred =
    (typeof profile?.short_name === "string" && profile.short_name.trim()) ||
    (typeof profile?.name === "string" && profile.name.trim().split(/\s+/)[0]) ||
    null;
  const fullName =
    typeof profile?.name === "string" ? profile.name.trim() : null;
  const plan = profile?.plan || null;

  const orgLines: string[] = [];
  for (const row of memberships ?? []) {
    const ws = Array.isArray(row.workspaces)
      ? row.workspaces[0]
      : row.workspaces;
    if (!ws?.name) continue;
    orgLines.push(
      `- ${ws.name} (${ws.kind ?? "workspace"}) role=${row.role ?? "member"}`,
    );
  }

  const lines = [
    "Signed-in user profile (use for tone and personalization; stay within their authorized data):",
    preferred ? `Preferred name: ${preferred}` : null,
    fullName ? `Full name: ${fullName}` : null,
    profile?.email ? `Email: ${profile.email}` : null,
    plan ? `Billing plan: ${plan}. Respect this plan’s limits (voice, workspaces, org features). Do not promise capabilities they lack. Always confirm before deleting anything.` : null,
    orgLines.length ? "Organizations / workspaces:" : null,
    ...orgLines,
    preferred
      ? `Preferred name is ${preferred}. Use it naturally when helpful. Only greet with "Hi, ${preferred}" on the first message of a brand-new conversation — never on follow-ups, and never lead with raw IDs.`
      : "Only greet briefly on the first message of a brand-new conversation — never on follow-ups.",
  ].filter(Boolean);

  return lines.length > 1 ? lines.join("\n") : null;
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

  const workspaceId =
    refs.find((r: { ref_kind: string; workspace_id?: string | null }) =>
      r.ref_kind === "workspace"
    )?.ref_id ??
    refs.find((r: { workspace_id?: string | null }) => r.workspace_id)?.workspace_id ??
    null;

  const inventory: string[] = [];
  if (workspaceId) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, title, kind, space_id, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(25);
    if (projects?.length) {
      inventory.push("Projects in this workspace (most recently updated first):");
      for (const p of projects) {
        inventory.push(
          `- ${p.title} [${p.space_id}/${p.kind}] id=${p.id} updated=${p.updated_at}`,
        );
      }
    }
    const { data: sources } = await supabase
      .from("sources")
      .select("id, title, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(15);
    if (sources?.length) {
      inventory.push("Sources in this workspace (recent):");
      for (const s of sources) {
        inventory.push(`- ${s.title} id=${s.id} updated=${s.updated_at}`);
      }
    }
  }

  return [
    "The user is working inside one authorized workspace. Stay within this workspace only.",
    "Focused context refs:",
    ...lines,
    ...(inventory.length ? ["", "Workspace inventory:", ...inventory] : []),
    "",
    "Use this inventory to answer questions about projects, sources, and recent work. Do not invent items that are not listed.",
    "In casual replies, prefer project titles over raw UUIDs unless the user asks for an id.",
  ].join("\n");
}

function formatCondensedSystem(condensed: CondensedContext): string {
  const lines = [
    "Primary long-term memory for this chat (authoritative for older turns):",
    condensed.conversation_summary
      ? `Summary: ${condensed.conversation_summary}`
      : null,
    condensed.current_state ? `Current state: ${condensed.current_state}` : null,
    condensed.decisions?.length
      ? `Decisions: ${condensed.decisions.join("; ")}`
      : null,
    condensed.open_tasks?.length
      ? `Open tasks: ${condensed.open_tasks.join("; ")}`
      : null,
    condensed.important_entities?.length
      ? `Important entities: ${condensed.important_entities.join("; ")}`
      : null,
    condensed.preferences_constraints?.length
      ? `Preferences/constraints: ${condensed.preferences_constraints.join("; ")}`
      : null,
    "Treat this memory as ground truth for anything before the recent messages below.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildModelMessages(opts: {
  history: HistoryRow[];
  watermark: number;
  condensed: CondensedContext | null;
  contextText: string | null;
  userProfileText?: string | null;
  latestUserContent?: string;
}): Array<{ role: string; content: string }> {
  const afterWatermark = opts.history.filter(
    (m) => m.sort_order > opts.watermark,
  );
  const recent = afterWatermark.slice(-RECENT_MESSAGE_LIMIT);
  const allowedTools = resolveAllowedToolsEdge(opts.latestUserContent ?? "");
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: PRODUCT_SYSTEM_PROMPT },
    { role: "system", content: formatEdgeToolCatalog(allowedTools) },
  ];
  const condensedActive = condensedIsActive(opts.condensed);
  if (
    shouldSuppressReGreeting({
      turns: recent,
      condensedActive,
    })
  ) {
    messages.push({ role: "system", content: NO_REGREET_SYSTEM });
  }
  if (opts.userProfileText) {
    messages.push({ role: "system", content: opts.userProfileText });
  }
  // Only attach workspace inventory context when tools are unlocked
  if (opts.contextText && allowedTools.length > 0) {
    messages.push({ role: "system", content: opts.contextText });
  }
  if (opts.condensed && Object.keys(opts.condensed).length) {
    messages.push({
      role: "system",
      content: formatCondensedSystem(opts.condensed),
    });
  }
  for (const m of recent) {
    if (m.role === "system") continue;
    const content =
      m.role === "assistant"
        ? sanitizeAssistantVisibleText(m.content) || m.content
        : m.content;
    messages.push({ role: m.role, content });
  }
  return messages;
}

async function callBridge(
  bridgeUrl: string,
  bridgeSecret: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs = 45_000,
): Promise<string> {
  const bridgeRes = await fetch(`${bridgeUrl}/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bridgeSecret}`,
    },
    body: JSON.stringify({ model: MODEL, messages }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!bridgeRes.ok) {
    const detail = await bridgeRes.text().catch(() => "");
    throw new Error(detail || `AI bridge error (${bridgeRes.status})`);
  }
  const data = (await bridgeRes.json()) as { content?: string };
  return data.content?.trim() || "";
}

function parseCondensedJson(raw: string): CondensedContext | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as CondensedContext;
    return {
      conversation_summary: String(parsed.conversation_summary ?? ""),
      current_state: String(parsed.current_state ?? ""),
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.map(String)
        : [],
      open_tasks: Array.isArray(parsed.open_tasks)
        ? parsed.open_tasks.map(String)
        : [],
      important_entities: Array.isArray(parsed.important_entities)
        ? parsed.important_entities.map(String)
        : [],
      preferences_constraints: Array.isArray(parsed.preferences_constraints)
        ? parsed.preferences_constraints.map(String)
        : [],
      last_updated: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function maybeCondenseChat(opts: {
  bridgeUrl: string;
  bridgeSecret: string;
  // deno-lint-ignore no-explicit-any
  supabase: any;
  chatId: string;
  history: HistoryRow[];
  watermark: number;
  existing: CondensedContext | null;
}): Promise<{ occurred: boolean }> {
  const overflow = opts.history.filter((m) => m.sort_order > opts.watermark);
  const charCount = overflow.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  if (
    overflow.length < CONDENSE_MESSAGE_THRESHOLD &&
    charCount < CONDENSE_CHAR_THRESHOLD
  ) {
    return { occurred: false };
  }

  const keepRecent = Math.min(RECENT_MESSAGE_LIMIT, overflow.length);
  const toCondense = overflow.slice(0, overflow.length - keepRecent);
  if (toCondense.length < 8) return { occurred: false };

  const transcript = toCondense
    .map(
      (m) =>
        `${m.role}: ${
          m.role === "assistant"
            ? sanitizeAssistantVisibleText(m.content) || m.content
            : m.content
        }`,
    )
    .join("\n")
    .slice(0, 14_000);

  const existingJson = JSON.stringify(opts.existing ?? {}, null, 0);
  const prompt = `Update this condensed chat context JSON by MERGING the existing condensed context with the new messages.
Preserve requirements, decisions, constraints, open tasks, important names, goals, pending questions, and current state from BOTH sources.
Drop conversational filler and any tool/JSON chrome. Return ONLY valid JSON with keys:
conversation_summary, current_state, decisions, open_tasks, important_entities, preferences_constraints

Existing condensed context:
${existingJson}

New messages since last condensation:
${transcript}`;

  const raw = await callBridge(
    opts.bridgeUrl,
    opts.bridgeSecret,
    [
      {
        role: "system",
        content:
          "You maintain structured conversation memory. Merge prior summary with new turns. Reply with JSON only.",
      },
      { role: "user", content: prompt },
    ],
    60_000,
  );

  const next = parseCondensedJson(raw);
  if (!next) return { occurred: false };

  // Guarantee prior summary is retained even if the model drops it.
  next.conversation_summary = mergeCondensedSummaries(
    opts.existing?.conversation_summary,
    next.conversation_summary ?? "",
  );
  if (opts.existing?.decisions?.length) {
    next.decisions = Array.from(
      new Set([...(opts.existing.decisions ?? []), ...(next.decisions ?? [])]),
    );
  }
  if (opts.existing?.open_tasks?.length) {
    next.open_tasks = Array.from(
      new Set([...(opts.existing.open_tasks ?? []), ...(next.open_tasks ?? [])]),
    );
  }
  if (opts.existing?.important_entities?.length) {
    next.important_entities = Array.from(
      new Set([
        ...(opts.existing.important_entities ?? []),
        ...(next.important_entities ?? []),
      ]),
    );
  }

  const newWatermark = toCondense[toCondense.length - 1].sort_order;
  const { error } = await opts.supabase
    .from("ai_chats")
    .update({
      condensed_context: next,
      condensed_through_sort_order: newWatermark,
      condensed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.chatId);

  if (error) throw error;
  return { occurred: true };
}
