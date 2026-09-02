/**
 * Write-action idempotency — prevent duplicate side effects on model retries.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolExecutionResult } from "@/lib/ai/tools/types";

export function buildIdempotencyKey(input: {
  toolId: string;
  connectionId: string;
  arguments: Record<string, unknown>;
  turnId?: string | null;
  toolCallId?: string | null;
}): string {
  // Prefer model toolCallId when present (exact retry of same call).
  if (input.toolCallId?.trim()) {
    return `tc:${input.toolCallId.trim()}`;
  }
  const normalized = stableStringify(input.arguments);
  const hash = createHash("sha256")
    .update(
      [
        input.toolId,
        input.connectionId,
        normalized,
        input.turnId ?? "",
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
  return `args:${hash}`;
}

function stableStringify(value: unknown): string {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export async function lookupIdempotentExecution(input: {
  client: SupabaseClient;
  ownerId: string;
  idempotencyKey: string;
}): Promise<ToolExecutionResult | null> {
  const { data, error } = await input.client
    .from("tool_executions")
    .select("result")
    .eq("owner_id", input.ownerId)
    .eq("idempotency_key", input.idempotencyKey)
    .eq("status", "success")
    .maybeSingle();
  if (error) {
    // Table may not exist yet during migration rollout — treat as miss.
    if (/does not exist|42P01/i.test(error.message)) return null;
    throw error;
  }
  if (!data?.result || typeof data.result !== "object") return null;
  return data.result as ToolExecutionResult;
}

export async function persistIdempotentExecution(input: {
  client: SupabaseClient;
  ownerId: string;
  workspaceId: string;
  chatId?: string | null;
  turnId?: string | null;
  toolId: string;
  connectionId?: string | null;
  toolCallId: string;
  idempotencyKey: string;
  status: "success" | "error" | "denied" | "pending";
  arguments: Record<string, unknown>;
  result: ToolExecutionResult;
}): Promise<void> {
  const { error } = await input.client.from("tool_executions").upsert(
    {
      owner_id: input.ownerId,
      workspace_id: input.workspaceId,
      chat_id: input.chatId ?? null,
      turn_id: input.turnId ?? null,
      tool_id: input.toolId,
      connection_id: input.connectionId ?? null,
      tool_call_id: input.toolCallId,
      idempotency_key: input.idempotencyKey,
      status: input.status,
      arguments: input.arguments,
      result: input.result,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,idempotency_key" },
  );
  if (error) {
    if (/does not exist|42P01/i.test(error.message)) return;
    // Unique race: another writer won — fine for idempotency.
    if (/duplicate|23505/i.test(error.message)) return;
    throw error;
  }
}

export function isWriteRisk(risk: "read" | "write" | "destructive"): boolean {
  return risk === "write" || risk === "destructive";
}
