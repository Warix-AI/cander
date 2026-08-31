/**
 * In-memory turn trace store — dev viewer + ring buffer.
 */

import type { TurnTrace, TurnTraceSummary } from "./types.ts";
import { summarizeTrace } from "./types.ts";

const MAX_TRACES = 120;

const listeners = new Set<(summaries: TurnTraceSummary[]) => void>();
const buffer: TurnTrace[] = [];
const byId = new Map<string, TurnTrace>();
let persistSink: ((trace: TurnTrace) => void) | null = null;

function emit(): void {
  const summaries = listTurnTraceSummaries();
  for (const fn of listeners) {
    try {
      fn(summaries);
    } catch {
      /* UI listener must not break tracing */
    }
  }
}

export function resetTurnTraceStoreForTests(): void {
  buffer.length = 0;
  byId.clear();
  listeners.clear();
}

export function storeTurnTrace(trace: TurnTrace): void {
  byId.set(trace.traceId, trace);
  const existingIdx = buffer.findIndex((t) => t.traceId === trace.traceId);
  if (existingIdx >= 0) buffer.splice(existingIdx, 1);
  buffer.unshift(trace);
  while (buffer.length > MAX_TRACES) {
    const removed = buffer.pop();
    if (removed) byId.delete(removed.traceId);
  }
  emit();
  if (persistSink && (trace.runtime ?? "local") === "local") {
    try {
      persistSink(trace);
    } catch {
      /* persistence must not break the turn */
    }
  }
}

export function getTurnTrace(traceId: string): TurnTrace | null {
  return byId.get(traceId) ?? null;
}

export function listTurnTraceSummaries(): TurnTraceSummary[] {
  return buffer.map(summarizeTrace);
}

export function listTurnTraces(): TurnTrace[] {
  return [...buffer];
}

export function ingestCloudTurnTrace(trace: TurnTrace): void {
  storeTurnTrace({ ...trace, runtime: trace.runtime ?? "cloud" });
}

export function ingestTurnTraceFromRow(row: {
  turn_id: string;
  chat_id: string;
  structured_trace?: TurnTrace | null;
}): TurnTrace | null {
  const trace = row.structured_trace;
  if (!trace?.traceId) return null;
  const normalized: TurnTrace = {
    ...trace,
    runtime: "cloud",
    turnId: row.turn_id,
    aiChatId: row.chat_id,
  };
  ingestCloudTurnTrace(normalized);
  return normalized;
}

export function subscribeTurnTraces(
  listener: (summaries: TurnTraceSummary[]) => void,
): () => void {
  listeners.add(listener);
  listener(listTurnTraceSummaries());
  return () => {
    listeners.delete(listener);
  };
}

export function setTurnTraceSink(fn: ((trace: TurnTrace) => void) | null): void {
  persistSink = fn;
}
