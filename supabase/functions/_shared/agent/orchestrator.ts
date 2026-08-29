/**
 * TurnOrchestrator — plan / retrieve / act / answer.
 * Models are pluggable backends via ModelProvider.
 */

import { braveWebSearch } from "./brave-search.ts";
import { validateCitations, formatSourcesForPrompt } from "./citations.ts";
import {
  buildContext,
  logContextBuild,
} from "./context-builder.ts";
import {
  buildConversationStateUpdate,
  resolveReferenceHints,
} from "./conversation-state.ts";
import {
  createKeywordHistoryRetriever,
} from "./history-retriever.ts";
import type { ModelProvider } from "./model-provider.ts";
import {
  applyPlannerDecision,
  routeDeterministic,
} from "./router.ts";
import { checkRetrievalSufficiency } from "./sufficiency.ts";
import type {
  ClientActionRequest,
  ConversationState,
  DeterministicRoute,
  RetrievalSource,
  RunTurnResult,
  StatusEvent,
  TurnBudget,
} from "./types.ts";
import {
  isInternalResultBlob,
  NORMAL_TURN_BUDGET as DEFAULT_BUDGET,
  RESEARCH_TURN_BUDGET,
} from "./types.ts";

const PRODUCT_SYSTEM = `You are Cander, a private AI assistant.
Be clear and concise. Prefer plain language.
When source IDs are provided, attribute claims only to those sources (cite by id or real URL).
Never invent headlines, URLs, or search results. Never claim you searched unless sources were provided.
Do not emit tool JSON unless the user is being asked to confirm a client action.`;

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type OrchestratorDeps = {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  ownerId: string;
  provider: ModelProvider;
  authHeader: string;
};

export type RunTurnInput = {
  turnId: string;
  chatId: string;
  content: string;
  images?: string[];
  workspaceKnowledgeHits?: Array<{
    title: string;
    snippet: string;
    id?: string;
  }>;
  researchMode?: boolean;
  /** Prior client_action results from a paused turn resume */
  clientActionResults?: Array<{ name: string; output: string; ok: boolean }>;
};

async function assertNotCancelled(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  turnId: string,
): Promise<void> {
  const { data } = await supabase
    .from("ai_chat_turns")
    .select("cancel_requested, status")
    .eq("turn_id", turnId)
    .maybeSingle();
  if (data?.cancel_requested || data?.status === "cancelled") {
    throw new Error("TURN_CANCELLED");
  }
}

export async function runTurnOrchestrator(
  deps: OrchestratorDeps,
  input: RunTurnInput,
): Promise<RunTurnResult> {
  const started = Date.now();
  const budget: TurnBudget = input.researchMode
    ? RESEARCH_TURN_BUDGET
    : DEFAULT_BUDGET;
  const statusEvents: StatusEvent[] = [];
  const pushStatus = (e: StatusEvent) => {
    statusEvents.push(e);
  };

  let failureStage = "init";
  let plannerCalls = 0;
  let webSearches = 0;
  let modelGens = 0;
  let route: DeterministicRoute = {
    kind: "answer_direct",
    reason: "unset",
  };
  const sources: RetrievalSource[] = [];
  let searchSessionId: string | null = null;
  let ttfStatus: number | null = null;
  let ttfToken: number | null = null;
  const clientActions: ClientActionRequest[] = [];

  const obs = (): Record<string, unknown> => ({
    turnId: input.turnId,
    chatId: input.chatId,
    provider: deps.provider.id,
    route: route.reason,
    plannerCalls,
    webSearches,
    modelGens,
    sourceCount: sources.length,
    ttfStatusMs: ttfStatus,
    ttfTokenMs: ttfToken,
    durationMs: Date.now() - started,
    failureStage: failureStage === "done" ? null : failureStage,
  });

  try {
    failureStage = "load_chat";
    const { data: chat, error: chatError } = await deps.supabase
      .from("ai_chats")
      .select("*")
      .eq("id", input.chatId)
      .eq("owner_id", deps.ownerId)
      .maybeSingle();
    if (chatError) throw chatError;
    if (!chat) throw new Error("Chat not found");

    // Idempotency: existing completed turn
    const { data: existingTurn } = await deps.supabase
      .from("ai_chat_turns")
      .select("*")
      .eq("turn_id", input.turnId)
      .maybeSingle();

    if (existingTurn?.status === "completed" && existingTurn.result) {
      return existingTurn.result as RunTurnResult;
    }
    if (existingTurn?.status === "cancelled") {
      return {
        turnId: input.turnId,
        chatId: input.chatId,
        userMessageId: existingTurn.user_message_id ?? "",
        assistantMessageId: null,
        content: "",
        status: "cancelled",
        offline: false,
        condensationOccurred: false,
        citations: [],
        clientActions: [],
        statusEvents: [{ phase: "done", label: "Cancelled" }],
        observability: obs(),
      };
    }

    failureStage = "persist_turn";
    if (!existingTurn) {
      const { error: turnInsErr } = await deps.supabase.from("ai_chat_turns").insert({
        turn_id: input.turnId,
        chat_id: input.chatId,
        owner_id: deps.ownerId,
        status: "running",
        cancel_requested: false,
        observability: {},
      });
      if (turnInsErr) {
        // Race: another request inserted — reload
        const { data: raced } = await deps.supabase
          .from("ai_chat_turns")
          .select("*")
          .eq("turn_id", input.turnId)
          .maybeSingle();
        if (raced?.status === "completed" && raced.result) {
          return raced.result as RunTurnResult;
        }
        if (raced?.status === "running") {
          // Another in-flight — wait briefly then return whatever completed
          await new Promise((r) => setTimeout(r, 1500));
          const { data: again } = await deps.supabase
            .from("ai_chat_turns")
            .select("*")
            .eq("turn_id", input.turnId)
            .maybeSingle();
          if (again?.result) return again.result as RunTurnResult;
        }
        throw turnInsErr;
      }
    } else {
      await deps.supabase
        .from("ai_chat_turns")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("turn_id", input.turnId);
    }

    pushStatus({ phase: "thinking", label: "Thinking", detail: "Starting…" });
    ttfStatus = Date.now() - started;

    // Persist real user utterance only
    const userContent = input.content.trim();
    if (!userContent) throw new Error("content required");
    if (isInternalResultBlob(userContent)) {
      throw new Error("Refusing to persist Internal-result blob as user message");
    }

    failureStage = "persist_user";
    let userMsgId = existingTurn?.user_message_id as string | null;
    let nextOrder = 0;
    if (userMsgId) {
      const { data: existingUser } = await deps.supabase
        .from("ai_chat_messages")
        .select("sort_order")
        .eq("id", userMsgId)
        .maybeSingle();
      nextOrder = (existingUser?.sort_order ?? 0);
    } else {
      const { data: existingMsgs } = await deps.supabase
        .from("ai_chat_messages")
        .select("sort_order")
        .eq("chat_id", input.chatId)
        .eq("owner_id", deps.ownerId)
        .order("sort_order", { ascending: false })
        .limit(1);
      nextOrder = (existingMsgs?.[0]?.sort_order ?? -1) + 1;
      userMsgId = newId("aim");
      const now = new Date().toISOString();
      const { error: userErr } = await deps.supabase
        .from("ai_chat_messages")
        .insert({
          id: userMsgId,
          chat_id: input.chatId,
          owner_id: deps.ownerId,
          role: "user",
          content: userContent,
          status: "complete",
          sort_order: nextOrder,
          error: null,
          created_at: now,
        });
      if (userErr) throw userErr;

      await deps.supabase
        .from("ai_chat_turns")
        .update({
          user_message_id: userMsgId,
          updated_at: new Date().toISOString(),
        })
        .eq("turn_id", input.turnId);
    }

    await assertNotCancelled(deps.supabase, input.turnId);

    // Route
    failureStage = "route";
    pushStatus({ phase: "routing", label: "Thinking", detail: "Routing…" });
    route = routeDeterministic(userContent);

    if (route.kind === "planner" && plannerCalls < budget.maxPlannerCalls) {
      plannerCalls++;
      modelGens++;
      const plan = await deps.provider.complete({
        purpose: "plan",
        messages: [
          {
            role: "system",
            content:
              'Decide next action as JSON: {"action":"answer"|"web"|"knowledge"|"client","tools":[],"reason":"..."}',
          },
          { role: "user", content: userContent },
        ],
      });
      const parsed = parseJsonObject(plan.text);
      route = applyPlannerDecision(parsed ?? { action: "web" });
      await deps.supabase.from("ai_chat_turn_events").insert({
        chat_id: input.chatId,
        owner_id: deps.ownerId,
        turn_id: input.turnId,
        message_id: userMsgId,
        kind: "planner",
        payload: { raw: plan.text.slice(0, 500), route },
      });
    }

    await deps.supabase
      .from("ai_chat_turns")
      .update({
        route_decision: route.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("turn_id", input.turnId);

    // Client actions → pause for thin client
    if (route.kind === "client_action" && !input.clientActionResults?.length) {
      for (const name of route.clientActions ?? ["ui.ask_clarification"]) {
        clientActions.push({
          name,
          arguments:
            name === "project.create"
              ? { title: userContent.slice(0, 80) }
              : name === "nav.open"
                ? { target: "build" }
                : { query: userContent.slice(0, 120) },
        });
      }
      pushStatus({
        phase: "client_action",
        label: "Thinking",
        detail: "Running app action…",
      });
      await deps.supabase.from("ai_chat_turn_events").insert({
        chat_id: input.chatId,
        owner_id: deps.ownerId,
        turn_id: input.turnId,
        message_id: userMsgId,
        kind: "client_action",
        payload: { actions: clientActions },
      });

      const paused: RunTurnResult = {
        turnId: input.turnId,
        chatId: input.chatId,
        userMessageId: userMsgId,
        assistantMessageId: null,
        content: "",
        status: "paused_for_client",
        offline: false,
        condensationOccurred: false,
        citations: [],
        clientActions,
        statusEvents,
        observability: obs(),
      };
      await deps.supabase
        .from("ai_chat_turns")
        .update({
          status: "running",
          result: paused,
          observability: obs(),
          updated_at: new Date().toISOString(),
        })
        .eq("turn_id", input.turnId);
      return paused;
    }

    // Knowledge hits from client
    if (
      (route.needsKnowledge || route.kind === "knowledge_retrieve") &&
      input.workspaceKnowledgeHits?.length
    ) {
      for (let i = 0; i < input.workspaceKnowledgeHits.length; i++) {
        const h = input.workspaceKnowledgeHits[i];
        sources.push({
          id: h.id ?? `kb_${i + 1}`,
          title: h.title,
          snippet: h.snippet,
          kind: "knowledge",
        });
      }
      await deps.supabase.from("ai_chat_turn_events").insert({
        chat_id: input.chatId,
        owner_id: deps.ownerId,
        turn_id: input.turnId,
        message_id: userMsgId,
        kind: "knowledge",
        payload: { count: sources.filter((s) => s.kind === "knowledge").length },
      });
    }

    // Web retrieval loop
    failureStage = "retrieve";
    let retrievalRounds = 0;
    const needsWeb =
      route.needsWeb ||
      route.kind === "web_retrieve" ||
      (route.ambiguous && sources.length === 0);

    let query = userContent.slice(0, 200);
    while (
      needsWeb &&
      webSearches < budget.maxWebSearches &&
      retrievalRounds < budget.maxRetrievalRounds
    ) {
      await assertNotCancelled(deps.supabase, input.turnId);
      retrievalRounds++;
      pushStatus({
        phase: "searching",
        label: "Thinking",
        detail: "Searching the web…",
      });

      if (webSearches > 0 && modelGens < budget.maxModelGenerations) {
        modelGens++;
        const rewritten = await deps.provider.complete({
          purpose: "rewrite",
          messages: [
            {
              role: "user",
              content: `Rewrite as a better web search query:\n${userContent}`,
            },
          ],
        });
        query = rewritten.text.replace(/^["']|["']$/g, "").trim().slice(0, 200) ||
          query;
      }

      try {
        webSearches++;
        const { sources: hits, raw } = await braveWebSearch({ query, count: 5 });
        sources.push(
          ...hits.map((h, i) => ({
            ...h,
            id: `web_${webSearches}_${i + 1}`,
          })),
        );

        const { data: session, error: sessErr } = await deps.supabase
          .from("ai_chat_search_sessions")
          .insert({
            chat_id: input.chatId,
            owner_id: deps.ownerId,
            originating_message_id: userMsgId,
            turn_id: input.turnId,
            queries: [query],
            results: raw,
          })
          .select("id")
          .single();
        if (sessErr) throw sessErr;
        searchSessionId = session.id;
        await deps.supabase
          .from("ai_chats")
          .update({ last_search_session_id: searchSessionId })
          .eq("id", input.chatId)
          .eq("owner_id", deps.ownerId);

        await deps.supabase.from("ai_chat_turn_events").insert({
          chat_id: input.chatId,
          owner_id: deps.ownerId,
          turn_id: input.turnId,
          message_id: userMsgId,
          kind: "web_search",
          payload: {
            query,
            resultCount: hits.length,
            sourceIds: hits.map((h) => h.id),
            sessionId: searchSessionId,
          },
        });
      } catch (searchErr) {
        console.error("[TURN_OBS]", {
          ...obs(),
          stage: "web_search_error",
          message:
            searchErr instanceof Error ? searchErr.message : String(searchErr),
        });
        break;
      }

      pushStatus({
        phase: "reading",
        label: "Thinking",
        detail: "Reading sources…",
      });
      const sufficiency = checkRetrievalSufficiency({
        query: userContent,
        sources: sources.filter((s) => s.kind === "web"),
      });
      if (sufficiency.sufficient) break;
      // continue loop for rewrite + another search
    }

    // History retrieval
    failureStage = "history";
    const { data: history } = await deps.supabase
      .from("ai_chat_messages")
      .select("id, role, content, sort_order")
      .eq("chat_id", input.chatId)
      .eq("owner_id", deps.ownerId)
      .order("sort_order", { ascending: true });

    const historyRows = (history ?? []).filter(
      (m: { content: string }) => !isInternalResultBlob(m.content),
    );
    const recent = historyRows.slice(-20);
    const excludeIds = new Set(recent.map((m: { id: string }) => m.id));
    const retriever = createKeywordHistoryRetriever(
      deps.supabase,
      deps.ownerId,
    );
    const retrieved = await retriever.search({
      chatId: input.chatId,
      query: userContent,
      limit: 6,
      excludeIds,
    });

    const state = (chat.conversation_state ?? {}) as ConversationState;
    const refHint = resolveReferenceHints({
      userText: userContent,
      state,
    });

    const searchEventsText = [
      refHint,
      sources.length
        ? formatSourcesForPrompt(sources)
        : needsWeb
          ? "Web search was attempted but returned no usable sources."
          : null,
      input.clientActionResults?.length
        ? `Client action results:\n${input.clientActionResults
            .map((r) => `${r.name}: ${r.ok ? r.output : `ERROR ${r.output}`}`)
            .join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    failureStage = "context_build";
    const built = buildContext({
      systemPrompt: PRODUCT_SYSTEM,
      conversationState: state,
      retrievedHistory: retrieved,
      searchEventsText,
      sources,
      recentMessages: recent,
      maxContextTokens: deps.provider.capabilities.maxContextTokens,
    });
    logContextBuild({
      turnId: input.turnId,
      chatId: input.chatId,
      tokenEstimate: built.tokenEstimate,
      counts: built.counts,
      recentIds: built.recentIds,
      sourceIds: sources.map((s) => s.id),
    });

    await assertNotCancelled(deps.supabase, input.turnId);

    failureStage = "generate";
    pushStatus({
      phase: "generating",
      label: "Thinking",
      detail: "Generating…",
    });
    modelGens++;
    const answerPromptExtra =
      sources.length > 0
        ? "You HAVE live retrieved sources below (or in prior system context). Answer the user's question from those sources now. Do NOT say you lack real-time access, cannot check the weather/news, or that you are only a language model without tools. Cite source ids or their real URLs only. If sources conflict, say so briefly."
        : needsWeb
          ? "Live web retrieval did not yield usable sources. Say you could not find reliable live information — do not invent. Do not invent weather, scores, or headlines."
          : "Answer helpfully from conversation context.";

    const genMessages = [
      ...built.messages,
      { role: "system" as const, content: answerPromptExtra },
    ];

    let answered = await deps.provider.complete({
      purpose: "answer",
      messages: genMessages,
      images: input.images,
    });
    ttfToken = Date.now() - started;

    await assertNotCancelled(deps.supabase, input.turnId);

    failureStage = "citations";
    let validated = validateCitations({
      answer: answered.text || "(empty reply)",
      sources,
    });
    let assistantContent = validated.text.trim() || "(empty reply)";

    // Model sometimes ignores sources and claims no real-time access — one forced rewrite.
    const falseNoRealtime =
      sources.length > 0 &&
      /\b(don'?t|do not|cannot|can'?t|no)\b[\s\S]{0,40}\b(real[- ]?time|current (weather|conditions)|access to (the )?(internet|web|live))\b/i.test(
        assistantContent,
      );
    if (falseNoRealtime && modelGens < budget.maxModelGenerations) {
      modelGens++;
      answered = await deps.provider.complete({
        purpose: "answer",
        messages: [
          ...genMessages,
          {
            role: "system",
            content:
              "Your previous draft incorrectly claimed no live access. Rewrite using ONLY the retrieved sources. Lead with the answer (e.g. temperature/conditions).",
          },
        ],
      });
      validated = validateCitations({
        answer: answered.text || assistantContent,
        sources,
      });
      assistantContent = validated.text.trim() || assistantContent;
    }

    // Never claim search without sources
    if (
      !sources.length &&
      /\b(I (searched|found)|according to (my )?search)\b/i.test(assistantContent)
    ) {
      assistantContent =
        "I couldn’t find reliable live sources for that. Try rephrasing or asking again in a moment.";
    }

    failureStage = "persist_assistant";
    const assistantId = newId("aim");
    const assistantRow = {
      id: assistantId,
      chat_id: input.chatId,
      owner_id: deps.ownerId,
      role: "assistant",
      content: assistantContent,
      status: "complete",
      sort_order: nextOrder + 1,
      error: null,
      created_at: new Date().toISOString(),
    };
    const { error: asstErr } = await deps.supabase
      .from("ai_chat_messages")
      .insert(assistantRow);
    if (asstErr) throw asstErr;

    failureStage = "done";
    pushStatus({ phase: "done", label: "Done" });

    const result: RunTurnResult = {
      turnId: input.turnId,
      chatId: input.chatId,
      userMessageId: userMsgId,
      assistantMessageId: assistantId,
      content: assistantContent,
      status: "completed",
      offline: false,
      condensationOccurred: false,
      citations: sources,
      clientActions: [],
      statusEvents,
      observability: {
        ...obs(),
        tokenEstimate: built.tokenEstimate,
        strippedCitationCount: validated.strippedUrls.length,
      },
    };

    await deps.supabase
      .from("ai_chat_turns")
      .update({
        status: "completed",
        assistant_message_id: assistantId,
        result,
        observability: result.observability,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        failure_stage: null,
      })
      .eq("turn_id", input.turnId);

    // Async conversation_state — fire and forget (await briefly so Edge doesn't drop)
    try {
      const nextState = buildConversationStateUpdate({
        prior: state,
        userText: userContent,
        assistantText: assistantContent,
        sources,
        searchSessionId,
        routeReason: route.reason,
      });
      await deps.supabase
        .from("ai_chats")
        .update({ conversation_state: nextState })
        .eq("id", input.chatId)
        .eq("owner_id", deps.ownerId);
    } catch (memErr) {
      console.warn("[conversation_state] update skipped", memErr);
    }

    console.log("[TURN_OBS]", result.observability);
    return result;
  } catch (err) {
    const cancelled =
      err instanceof Error && err.message === "TURN_CANCELLED";
    const message = err instanceof Error ? err.message : String(err);
    console.error("[TURN_OBS]", {
      ...obs(),
      error: cancelled ? "cancelled" : message.slice(0, 200),
    });

    if (cancelled) {
      await deps.supabase
        .from("ai_chat_turns")
        .update({
          status: "cancelled",
          failure_stage: failureStage,
          observability: obs(),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("turn_id", input.turnId);
      // Do not write stale assistant message
      return {
        turnId: input.turnId,
        chatId: input.chatId,
        userMessageId: "",
        assistantMessageId: null,
        content: "",
        status: "cancelled",
        offline: false,
        condensationOccurred: false,
        citations: [],
        clientActions: [],
        statusEvents: [...statusEvents, { phase: "done", label: "Cancelled" }],
        observability: obs(),
      };
    }

    const offline = /bridge|tunnel|not configured|fetch/i.test(message);
    const assistantContent = offline
      ? "I couldn't reach the AI bridge. Check that Ollama, the local bridge, and the HTTPS tunnel are running."
      : `Something went wrong: ${message}`;

    // Only persist error assistant if turn wasn't cancelled
    let assistantMessageId: string | null = null;
    try {
      const { data: turn } = await deps.supabase
        .from("ai_chat_turns")
        .select("cancel_requested, user_message_id")
        .eq("turn_id", input.turnId)
        .maybeSingle();
      if (!turn?.cancel_requested) {
        const { data: existingMsgs } = await deps.supabase
          .from("ai_chat_messages")
          .select("sort_order")
          .eq("chat_id", input.chatId)
          .eq("owner_id", deps.ownerId)
          .order("sort_order", { ascending: false })
          .limit(1);
        const nextOrder = (existingMsgs?.[0]?.sort_order ?? -1) + 1;
        assistantMessageId = newId("aim");
        await deps.supabase.from("ai_chat_messages").insert({
          id: assistantMessageId,
          chat_id: input.chatId,
          owner_id: deps.ownerId,
          role: "assistant",
          content: assistantContent,
          status: "error",
          sort_order: nextOrder,
          error: message.slice(0, 500),
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // ignore
    }

    const failed: RunTurnResult = {
      turnId: input.turnId,
      chatId: input.chatId,
      userMessageId: "",
      assistantMessageId,
      content: assistantContent,
      status: "failed",
      offline,
      condensationOccurred: false,
      citations: sources,
      clientActions: [],
      statusEvents: [
        ...statusEvents,
        { phase: "error", label: "Error", detail: message.slice(0, 120) },
      ],
      observability: { ...obs(), failureStage },
    };

    await deps.supabase
      .from("ai_chat_turns")
      .update({
        status: "failed",
        assistant_message_id: assistantMessageId,
        result: failed,
        failure_stage: failureStage,
        observability: failed.observability,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("turn_id", input.turnId);

    return failed;
  }
}
