/**
 * Routing telemetry (Phase 6).
 * In-memory buffer always; optional durable write to `ai_routing_events`.
 * Never shown in the product UI.
 */

import type { RoutingDecision } from "./types.ts";

export type RoutingTelemetryEvent = {
  at: string;
  threadId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  taskType: string;
  target: string;
  reason: string;
  latencyMs?: number;
  outcome?: "ok" | "error" | "escalated" | "cancelled";
};

const MAX = 200;
const buffer: RoutingTelemetryEvent[] = [];

export function recordRoutingDecision(
  decision: RoutingDecision,
  meta?: {
    threadId?: string | null;
    projectId?: string | null;
    workspaceId?: string | null;
    latencyMs?: number;
    outcome?: RoutingTelemetryEvent["outcome"];
  },
) {
  const event: RoutingTelemetryEvent = {
    at: new Date().toISOString(),
    threadId: meta?.threadId,
    projectId: meta?.projectId,
    workspaceId: meta?.workspaceId,
    taskType: decision.taskType,
    target: decision.target,
    reason: decision.reason,
    latencyMs: meta?.latencyMs,
    outcome: meta?.outcome,
  };
  buffer.push(event);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  if (typeof console !== "undefined" && console.debug) {
    console.debug(
      "[cander-intel]",
      decision.taskType,
      decision.target,
      decision.reason,
    );
  }
  void persistRoutingEvent(event);
}

async function persistRoutingEvent(event: RoutingTelemetryEvent) {
  if (typeof window === "undefined") return;
  try {
    const { isSupabaseConfigured } = await import("@/lib/data-backend");
    if (!isSupabaseConfigured()) return;
    const { createSupabaseBrowserClient } = await import(
      "@/lib/supabase/client"
    );
    const supabase = createSupabaseBrowserClient();
    await supabase.from("ai_routing_events").insert({
      workspace_id: event.workspaceId || null,
      thread_id: event.threadId || null,
      project_id: event.projectId || null,
      task_type: event.taskType,
      target: event.target,
      reason: event.reason,
      latency_ms: event.latencyMs ?? null,
      outcome: event.outcome ?? null,
    });
  } catch {
    // Telemetry must never break the turn.
  }
}

export function getRoutingTelemetrySnapshot(): RoutingTelemetryEvent[] {
  return [...buffer];
}

export function clearRoutingTelemetry() {
  buffer.length = 0;
}
