/**
 * Structured tool event persistence — normalized ToolExecutionResult history.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolExecutionResult, ToolReference } from "@/lib/ai/tools/types";

export type PersistedToolEvent = {
  id: string;
  chatId: string;
  turnId: string;
  toolId: string;
  result: ToolExecutionResult;
  createdAt: string;
};

export async function persistToolEvent(input: {
  client: SupabaseClient;
  chatId: string;
  ownerId: string;
  turnId: string;
  messageId?: string | null;
  result: ToolExecutionResult;
}): Promise<void> {
  const { error } = await input.client.from("ai_chat_turn_events").insert({
    chat_id: input.chatId,
    owner_id: input.ownerId,
    turn_id: input.turnId,
    message_id: input.messageId ?? null,
    kind: "connector_tool",
    payload: {
      toolCallId: input.result.toolCallId,
      toolId: input.result.toolId,
      connectionId: input.result.connectionId ?? null,
      idempotencyKey: input.result.idempotencyKey,
      status: input.result.status,
      data: input.result.data ?? null,
      references: input.result.references ?? [],
      error: input.result.error ?? null,
    },
  });
  if (error) {
    // Soft-fail if migration not applied yet or kind check rejects.
    if (/check|kind|does not exist|22P02|23514/i.test(error.message)) {
      console.warn("[tool-events] persist skipped:", error.message);
      return;
    }
    throw error;
  }
}

export async function loadRecentToolEvents(input: {
  client: SupabaseClient;
  chatId: string;
  ownerId: string;
  limit?: number;
}): Promise<PersistedToolEvent[]> {
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));
  const { data, error } = await input.client
    .from("ai_chat_turn_events")
    .select("id, chat_id, turn_id, payload, created_at")
    .eq("chat_id", input.chatId)
    .eq("owner_id", input.ownerId)
    .eq("kind", "connector_tool")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (/does not exist|check|kind/i.test(error.message)) return [];
    throw error;
  }

  return (data ?? []).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const result: ToolExecutionResult = {
      status: (payload.status as ToolExecutionResult["status"]) ?? "error",
      toolId: String(payload.toolId ?? ""),
      connectionId:
        typeof payload.connectionId === "string" ? payload.connectionId : undefined,
      toolCallId: String(payload.toolCallId ?? row.id),
      idempotencyKey: String(payload.idempotencyKey ?? row.id),
      data: payload.data,
      references: Array.isArray(payload.references)
        ? (payload.references as ToolReference[])
        : [],
      error:
        payload.error && typeof payload.error === "object"
          ? (payload.error as ToolExecutionResult["error"])
          : undefined,
    };
    return {
      id: row.id as string,
      chatId: row.chat_id as string,
      turnId: row.turn_id as string,
      toolId: result.toolId,
      result,
      createdAt: row.created_at as string,
    };
  });
}

export function collectReferencesFromEvents(
  events: PersistedToolEvent[],
): ToolReference[] {
  const out: ToolReference[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    for (const ref of event.result.references ?? []) {
      const key = `${ref.type}:${ref.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}
