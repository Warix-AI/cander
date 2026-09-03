/**
 * Phase 0 live-turn latency instrumentation.
 *
 * Records safe timing boundaries for signed-in Send → reply paths.
 * Never stores raw user prompts, assistant text, credentials, or connector payloads.
 * Telemetry failures must never fail the reply (all public APIs are try/catch-guarded).
 */

import { classifyKnowledgeRoute } from "./simple-turn/knowledge-route.ts";

export type LiveTurnCohort =
  | "simple_no_tool"
  | "light_web_search"
  | "tool_heavy";

export type LiveTurnTransport = "agent" | "raw" | "comms" | "unknown";

export type LiveTurnOutcome =
  | "ok"
  | "error"
  | "cancelled"
  | "paused";

/** Named marks — offsets are ms from send_initiated (t0). */
export type LiveTurnMark =
  | "send_initiated"
  | "context_ready"
  | "attachments_done"
  | "agent_probe_start"
  | "agent_probe_end"
  | "dispatch_start"
  | "response_received"
  | "first_content_received"
  | "first_content_visible"
  | "tool_phase"
  | "reply_resolved"
  | "complete"
  | "commit";

export type LiveTurnLatencyEvent = {
  at: string;
  turnId: string;
  threadId?: string | null;
  workspaceId?: string | null;
  assistantMessageId?: string | null;
  transport: LiveTurnTransport;
  cohort: LiveTurnCohort;
  provisionalCohort: LiveTurnCohort;
  outcome: LiveTurnOutcome;
  /** ms from send_initiated for each recorded mark */
  marks: Partial<Record<LiveTurnMark, number>>;
  /** Derived durations (ms), when both endpoints exist */
  durations: {
    contextPrepMs?: number;
    agentProbeMs?: number;
    dispatchToResponseMs?: number;
    responseToFirstContentMs?: number;
    firstContentToVisibleMs?: number;
    sendToFirstContentMs?: number;
    sendToFirstVisibleMs?: number;
    sendToCompleteMs?: number;
    serverDurationMs?: number;
  };
  signals: {
    historyMessageCount?: number;
    attachmentCount?: number;
    selectedConnectionCount?: number;
    webSearchUsed?: boolean;
    webSearchEnabled?: boolean;
    toolResultCount?: number;
    agentV2?: boolean;
    contentStreaming?: boolean;
    presentationStreamed?: boolean;
  };
  errorCode?: string;
};

const MAX_EVENTS = 200;
const buffer: LiveTurnLatencyEvent[] = [];

const SAFE_EVENT_KEYS = new Set([
  "at",
  "turnId",
  "threadId",
  "workspaceId",
  "assistantMessageId",
  "transport",
  "cohort",
  "provisionalCohort",
  "outcome",
  "marks",
  "durations",
  "signals",
  "errorCode",
]);

/** Classify cohort from ephemeral text — only the label is retained. */
export function provisionalCohortFromInput(opts: {
  text: string;
  selectedConnectionCount?: number;
  attachmentCount?: number;
}): LiveTurnCohort {
  if ((opts.selectedConnectionCount ?? 0) > 0) return "tool_heavy";
  const route = classifyKnowledgeRoute((opts.text || "").trim());
  if (route === "WEB_REQUIRED") return "light_web_search";
  if (route === "LOCAL") return "simple_no_tool";
  // UNCERTAIN: treat as light web until transport signals refine.
  return "light_web_search";
}

export function refineLiveTurnCohort(opts: {
  provisional: LiveTurnCohort;
  webSearchUsed?: boolean;
  toolResultCount?: number;
  selectedConnectionCount?: number;
  pausedForTool?: boolean;
}): LiveTurnCohort {
  if (
    (opts.toolResultCount ?? 0) > 0 ||
    opts.pausedForTool ||
    (opts.selectedConnectionCount ?? 0) > 0
  ) {
    return "tool_heavy";
  }
  if (opts.webSearchUsed) return "light_web_search";
  if (opts.provisional === "light_web_search") return "light_web_search";
  return "simple_no_tool";
}

export function percentile(sortedAsc: number[], p: number): number | undefined {
  if (!sortedAsc.length) return undefined;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const w = rank - lo;
  const a = sortedAsc[lo]!;
  const b = sortedAsc[hi]!;
  return a + (b - a) * w;
}

export function computeDurationPercentiles(
  values: number[],
): { p50?: number; p75?: number; p90?: number; p95?: number; n: number } {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
  };
}

export function summarizeLiveTurnLatency(
  events: LiveTurnLatencyEvent[],
  durationKey: keyof LiveTurnLatencyEvent["durations"] = "sendToFirstVisibleMs",
  cohort?: LiveTurnCohort,
) {
  const filtered = events.filter((e) =>
    cohort ? e.cohort === cohort : true,
  );
  const values = filtered
    .map((e) => e.durations[durationKey])
    .filter((n): n is number => typeof n === "number");
  return computeDurationPercentiles(values);
}

/** Strip unknown keys / nested string blobs that look like content. */
export function sanitizeLiveTurnLatencyEvent(
  event: LiveTurnLatencyEvent,
): LiveTurnLatencyEvent {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (!SAFE_EVENT_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out as LiveTurnLatencyEvent;
}

export function assertNoSensitiveLatencyFields(event: unknown): void {
  const json = JSON.stringify(event);
  const banned = [
    "content",
    "prompt",
    "messages",
    "userInput",
    "assistantText",
    "authorization",
    "apiKey",
    "password",
    "secret",
    "credential",
  ];
  for (const key of banned) {
    // Allow keys that are part of mark names / meta, not payload fields.
    if (key === "content") {
      if (
        /"(userInput|assistantText|prompt|messages|content)"\s*:/.test(json)
      ) {
        throw new Error(`Sensitive field leaked in latency event: ${key}`);
      }
      continue;
    }
    if (new RegExp(`"${key}"\\s*:`, "i").test(json)) {
      throw new Error(`Sensitive field leaked in latency event: ${key}`);
    }
  }
}

function newTurnId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `lt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type LiveTurnLatencySession = {
  readonly turnId: string;
  mark: (name: LiveTurnMark) => void;
  markFirstContentReceived: (opts?: { streaming?: boolean }) => void;
  markFirstContentVisible: () => void;
  markToolPhase: () => void;
  setTransport: (transport: LiveTurnTransport) => void;
  setServerDurationMs: (ms: number) => void;
  setSignals: (partial: LiveTurnLatencyEvent["signals"]) => void;
  finalize: (opts: {
    outcome: LiveTurnOutcome;
    errorCode?: string;
  }) => LiveTurnLatencyEvent | null;
};

export function startLiveTurnLatency(opts: {
  threadId?: string | null;
  workspaceId?: string | null;
  assistantMessageId?: string | null;
  provisionalCohort: LiveTurnCohort;
  historyMessageCount?: number;
  attachmentCount?: number;
  selectedConnectionCount?: number;
}): LiveTurnLatencySession {
  const turnId = newTurnId();
  const t0 = Date.now();
  const marks: Partial<Record<LiveTurnMark, number>> = {
    send_initiated: 0,
  };
  let transport: LiveTurnTransport = "unknown";
  let serverDurationMs: number | undefined;
  let signals: LiveTurnLatencyEvent["signals"] = {
    historyMessageCount: opts.historyMessageCount,
    attachmentCount: opts.attachmentCount,
    selectedConnectionCount: opts.selectedConnectionCount,
  };
  let finalized = false;
  const provisional = opts.provisionalCohort;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* telemetry must never break the turn */
    }
  };

  const mark = (name: LiveTurnMark) => {
    safe(() => {
      if (finalized) return;
      if (marks[name] != null) return;
      marks[name] = Date.now() - t0;
    });
  };

  const buildDurations = (): LiveTurnLatencyEvent["durations"] => {
    const m = marks;
    const d: LiveTurnLatencyEvent["durations"] = {};
    if (m.context_ready != null) d.contextPrepMs = m.context_ready;
    if (m.agent_probe_start != null && m.agent_probe_end != null) {
      d.agentProbeMs = m.agent_probe_end - m.agent_probe_start;
    }
    if (m.dispatch_start != null && m.response_received != null) {
      d.dispatchToResponseMs = m.response_received - m.dispatch_start;
    }
    if (m.response_received != null && m.first_content_received != null) {
      d.responseToFirstContentMs =
        m.first_content_received - m.response_received;
    }
    if (
      m.first_content_received != null &&
      m.first_content_visible != null
    ) {
      d.firstContentToVisibleMs =
        m.first_content_visible - m.first_content_received;
    }
    if (m.first_content_received != null) {
      d.sendToFirstContentMs = m.first_content_received;
    }
    if (m.first_content_visible != null) {
      d.sendToFirstVisibleMs = m.first_content_visible;
    }
    if (m.complete != null) d.sendToCompleteMs = m.complete;
    else if (m.commit != null) d.sendToCompleteMs = m.commit;
    if (serverDurationMs != null) d.serverDurationMs = serverDurationMs;
    return d;
  };

  return {
    turnId,
    mark,
    markFirstContentReceived: (o) => {
      safe(() => {
        if (o?.streaming) signals = { ...signals, contentStreaming: true };
        mark("first_content_received");
      });
    },
    markFirstContentVisible: () => mark("first_content_visible"),
    markToolPhase: () => mark("tool_phase"),
    setTransport: (t) => {
      safe(() => {
        transport = t;
      });
    },
    setServerDurationMs: (ms) => {
      safe(() => {
        if (Number.isFinite(ms)) serverDurationMs = ms;
      });
    },
    setSignals: (partial) => {
      safe(() => {
        signals = { ...signals, ...partial };
      });
    },
    finalize: (fin) => {
      try {
        if (finalized) return null;
        finalized = true;
        if (fin.outcome === "ok" || fin.outcome === "paused") {
          if (marks.complete == null) marks.complete = Date.now() - t0;
          if (marks.commit == null) marks.commit = marks.complete;
        } else if (marks.complete == null) {
          marks.complete = Date.now() - t0;
        }

        const cohort = refineLiveTurnCohort({
          provisional,
          webSearchUsed: signals.webSearchUsed,
          toolResultCount: signals.toolResultCount,
          selectedConnectionCount: signals.selectedConnectionCount,
          pausedForTool: fin.outcome === "paused",
        });

        const event = sanitizeLiveTurnLatencyEvent({
          at: new Date().toISOString(),
          turnId,
          threadId: opts.threadId ?? null,
          workspaceId: opts.workspaceId ?? null,
          assistantMessageId: opts.assistantMessageId ?? null,
          transport,
          cohort,
          provisionalCohort: provisional,
          outcome: fin.outcome,
          marks: { ...marks },
          durations: buildDurations(),
          signals: { ...signals },
          ...(fin.errorCode ? { errorCode: fin.errorCode.slice(0, 80) } : {}),
        });

        assertNoSensitiveLatencyFields(event);
        buffer.push(event);
        if (buffer.length > MAX_EVENTS) {
          buffer.splice(0, buffer.length - MAX_EVENTS);
        }
        if (typeof console !== "undefined" && console.debug) {
          console.debug("[LIVE_TURN_LATENCY]", event);
        }
        return event;
      } catch {
        return null;
      }
    },
  };
}

export function getLiveTurnLatencySnapshot(): LiveTurnLatencyEvent[] {
  return buffer.map((e) => ({ ...e, marks: { ...e.marks }, durations: { ...e.durations }, signals: { ...e.signals } }));
}

export function clearLiveTurnLatency() {
  buffer.length = 0;
}

/** Test helper: record a pre-built event (still sanitized). */
export function recordLiveTurnLatencyEventForTests(
  event: LiveTurnLatencyEvent,
): void {
  const safe = sanitizeLiveTurnLatencyEvent(event);
  assertNoSensitiveLatencyFields(safe);
  buffer.push(safe);
}
