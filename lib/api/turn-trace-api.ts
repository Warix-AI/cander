"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ingestTurnTraceFromRow,
  type TurnTrace,
} from "@/lib/ai/orchestrator/turn-trace/index";

export type CloudTurnTraceRow = {
  turn_id: string;
  chat_id: string;
  status: string;
  created_at: string;
  structured_trace: TurnTrace | null;
};

export async function fetchCloudTurnTraces(limit = 40): Promise<TurnTrace[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("ai_chat_turns")
    .select("turn_id, chat_id, status, created_at, structured_trace")
    .not("structured_trace", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const traces: TurnTrace[] = [];
  for (const row of (data ?? []) as CloudTurnTraceRow[]) {
    const trace = ingestTurnTraceFromRow(row);
    if (trace) traces.push(trace);
  }
  return traces;
}

export async function fetchCloudTurnTrace(turnId: string): Promise<TurnTrace | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("ai_chat_turns")
    .select("turn_id, chat_id, structured_trace")
    .eq("turn_id", turnId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return ingestTurnTraceFromRow(data as CloudTurnTraceRow);
}
