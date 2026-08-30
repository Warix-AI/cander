"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export type AgentStatusEvent = {
  phase: string;
  label: string;
  detail?: string;
};

export type AgentClientAction = {
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentRunTurnResult = {
  turnId: string;
  chatId: string;
  userMessageId: string;
  assistantMessageId: string | null;
  content: string;
  status: "completed" | "failed" | "cancelled" | "paused_for_client";
  offline: boolean;
  condensationOccurred: boolean;
  citations: Array<{
    id: string;
    title: string;
    url?: string | null;
    snippet?: string;
    kind: string;
  }>;
  clientActions: AgentClientAction[];
  statusEvents: AgentStatusEvent[];
  observability: Record<string, unknown>;
  orchestratorVersion?: string;
};

export type AgentStreamEvent =
  | (AgentStatusEvent & { type: "status" })
  | { type: "turn.started"; turnId: string; chatId: string }
  | { type: "turn.completed"; result: AgentRunTurnResult }
  | { type: "turn.paused"; result: AgentRunTurnResult }
  | { type: "turn.failed"; error: string; result?: AgentRunTurnResult }
  | { type: "turn.cancelled"; turnId: string };

type RunTurnBody = {
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
  clientActionResults?: Array<{ name: string; output: string; ok: boolean }>;
  orchestratorVersion?: "v1" | "v2";
  locationHint?: string | null;
  userTimezone?: string | null;
};

type AgentAction =
  | ({ action: "run_turn" } & RunTurnBody)
  | { action: "cancel_turn"; turnId: string }
  | { action: "get_turn"; turnId: string };

async function invokeAiAgent<T>(body: AgentAction): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke("ai-agent", { body });
  if (error) {
    let detail = error.message || "AI agent request failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const bodyJson = await ctx.json();
        if (bodyJson?.error) detail = String(bodyJson.error);
      }
    } catch {
      // keep detail
    }
    throw new Error(detail);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export function runAgentTurn(body: RunTurnBody) {
  return invokeAiAgent<AgentRunTurnResult>({
    action: "run_turn",
    ...body,
  });
}

/**
 * Progressive NDJSON stream from Edge `run_turn_stream`.
 * Falls back to non-streaming `run_turn` if streaming fails to start.
 */
export async function runAgentTurnStream(
  body: RunTurnBody,
  opts?: {
    onEvent?: (ev: AgentStreamEvent) => void;
    signal?: AbortSignal;
  },
): Promise<AgentRunTurnResult> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    // fallback
    return runAgentTurn(body);
  }

  const url = `${supabaseUrl()}/functions/v1/ai-agent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "run_turn_stream",
        ...body,
        orchestratorVersion: body.orchestratorVersion ?? "v2",
      }),
      signal: opts?.signal,
    });
  } catch {
    return runAgentTurn(body);
  }

  if (!res.ok || !res.body) {
    // Non-stream error or gateway issue — try classic invoke
    return runAgentTurn(body);
  }

  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("ndjson") && !ctype.includes("json")) {
    return runAgentTurn(body);
  }

  // If server returned a single JSON object (non-stream path), parse it
  if (ctype.includes("application/json") && !ctype.includes("ndjson")) {
    const data = (await res.json()) as AgentRunTurnResult & { error?: string };
    if (data?.error) throw new Error(String(data.error));
    return data;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AgentRunTurnResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let ev: AgentStreamEvent;
      try {
        ev = JSON.parse(trimmed) as AgentStreamEvent;
      } catch {
        continue;
      }
      try {
        opts?.onEvent?.(ev);
      } catch {
        // ignore UI errors
      }
      if (ev.type === "turn.completed" || ev.type === "turn.paused") {
        finalResult = ev.result;
      }
      if (ev.type === "turn.failed") {
        if (ev.result) finalResult = ev.result;
        else throw new Error(ev.error || "Turn failed");
      }
      if (ev.type === "turn.cancelled") {
        finalResult = {
          turnId: ev.turnId,
          chatId: body.chatId,
          userMessageId: "",
          assistantMessageId: null,
          content: "",
          status: "cancelled",
          offline: false,
          condensationOccurred: false,
          citations: [],
          clientActions: [],
          statusEvents: [],
          observability: {},
        };
      }
    }
  }

  if (!finalResult) {
    throw new Error("Stream ended without a turn result");
  }
  return finalResult;
}

export function cancelAgentTurn(turnId: string) {
  return invokeAiAgent<{ ok: boolean; turnId: string }>({
    action: "cancel_turn",
    turnId,
  });
}

export function getAgentTurn(turnId: string) {
  return invokeAiAgent<{ turn: Record<string, unknown> }>({
    action: "get_turn",
    turnId,
  });
}

export function newTurnId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
