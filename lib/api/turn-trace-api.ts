"use client";

import { getTurnAudit } from "@/lib/ai/orchestrator/turn-audit.ts";
import {
  getRetrievalTrace,
  type TurnRetrievalTrace,
} from "@/lib/ai/orchestrator/retrieval-trace.ts";
import {
  ingestCloudTurnTrace,
  ingestTurnTraceFromRow,
  isLocalTurnTracePersistEnabled,
  setTurnTraceSink,
  type TurnTrace,
} from "@/lib/ai/orchestrator/turn-trace/index";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type CloudTurnTraceRow = {
  turn_id: string;
  chat_id: string;
  status: string;
  created_at: string;
  structured_trace: TurnTrace | null;
};

export type LocalTurnTraceDetail = {
  version: 1;
  structuredTrace: TurnTrace;
  turnAudit?: ReturnType<typeof getTurnAudit>;
  retrievalTrace?: TurnRetrievalTrace;
  clientMeta?: {
    userAgent?: string;
    href?: string;
    persistedAt: string;
  };
};

type AuditTraceRow = {
  id: string;
  chat_id: string | null;
  status: string;
  created_at: string;
  detail: LocalTurnTraceDetail | null;
};

let persistHookRegistered = false;

function auditIdForTrace(traceId: string): string {
  return `aie_ltt_${traceId.replace(/-/g, "")}`;
}

function clientMeta(): LocalTurnTraceDetail["clientMeta"] {
  if (typeof window === "undefined") {
    return { persistedAt: new Date().toISOString() };
  }
  return {
    userAgent: window.navigator.userAgent,
    href: window.location.href,
    persistedAt: new Date().toISOString(),
  };
}

export async function persistLocalTurnTrace(trace: TurnTrace): Promise<void> {
  if (!isLocalTurnTracePersistEnabled()) return;
  if (!isSupabaseConfigured()) return;
  if ((trace.runtime ?? "local") !== "local") return;

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const detail: LocalTurnTraceDetail = {
    version: 1,
    structuredTrace: trace,
    turnAudit: getTurnAudit() ?? undefined,
    retrievalTrace: getRetrievalTrace(),
    clientMeta: clientMeta(),
  };

  const status =
    trace.failureReason || detail.turnAudit?.failureReason ? "error" : "ok";

  const { error } = await supabase.from("ai_audit_events").insert({
    id: auditIdForTrace(trace.traceId),
    owner_id: user.id,
    chat_id: trace.aiChatId ?? null,
    action: "local_turn_trace",
    provider: "apple_fm",
    status,
    detail,
    created_at: new Date(trace.finishedAt ?? Date.now()).toISOString(),
  });

  if (error) {
    console.warn("[TURN_TRACE_PERSIST]", {
      traceId: trace.traceId,
      error: error.message,
    });
    return;
  }

  console.log("[TURN_TRACE_PERSIST]", {
    traceId: trace.traceId,
    threadId: trace.threadId,
    latencyMs: trace.latencyMs,
    eventCount: trace.events.length,
    userInput: trace.userInput.slice(0, 120),
  });
}

export function ensureLocalTurnTracePersistHook(): void {
  if (persistHookRegistered) return;
  persistHookRegistered = true;
  setTurnTraceSink((trace) => {
    void persistLocalTurnTrace(trace);
  });
}

export function ingestPersistedLocalTurnTrace(
  detail: LocalTurnTraceDetail | null | undefined,
): TurnTrace | null {
  const trace = detail?.structuredTrace;
  if (!trace?.traceId) return null;
  const normalized: TurnTrace = {
    ...trace,
    runtime: "local",
  };
  ingestCloudTurnTrace(normalized);
  return normalized;
}

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

export async function fetchPersistedLocalTurnTraces(
  limit = 40,
): Promise<TurnTrace[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("ai_audit_events")
    .select("id, chat_id, status, created_at, detail")
    .eq("action", "local_turn_trace")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const traces: TurnTrace[] = [];
  for (const row of (data ?? []) as AuditTraceRow[]) {
    const trace = ingestPersistedLocalTurnTrace(row.detail);
    if (trace) traces.push(trace);
  }
  return traces;
}

export async function fetchAllPersistedTurnTraces(
  limit = 40,
): Promise<TurnTrace[]> {
  const [cloud, local] = await Promise.all([
    fetchCloudTurnTraces(limit).catch(() => [] as TurnTrace[]),
    fetchPersistedLocalTurnTraces(limit).catch(() => [] as TurnTrace[]),
  ]);
  const byId = new Map<string, TurnTrace>();
  for (const trace of [...cloud, ...local]) {
    byId.set(trace.traceId, trace);
  }
  return [...byId.values()].sort(
    (a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt),
  );
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

if (typeof window !== "undefined") {
  ensureLocalTurnTracePersistHook();
}
