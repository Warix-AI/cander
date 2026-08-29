"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
};

type AgentAction =
  | {
      action: "run_turn";
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
      clientActionResults?: Array<{
        name: string;
        output: string;
        ok: boolean;
      }>;
    }
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

export function runAgentTurn(body: {
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
}) {
  return invokeAiAgent<AgentRunTurnResult>({
    action: "run_turn",
    ...body,
  });
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
