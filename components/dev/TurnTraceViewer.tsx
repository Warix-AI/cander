"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildRetrievalChainView,
  filterTraceEvents,
  getTurnTrace,
  subscribeTurnTraces,
  type TraceStage,
  type TurnTrace,
  type TurnTraceSummary,
} from "@/lib/ai/orchestrator/turn-trace/index";
import { fetchAllPersistedTurnTraces } from "@/lib/api/turn-trace-api";

const STAGES: TraceStage[] = [
  "user_input",
  "hydrate",
  "plan",
  "plan_validate",
  "temporal_grounding",
  "request_ledger",
  "task_graph",
  "route_capability",
  "tool_request",
  "tool_response_raw",
  "evidence_accept",
  "evidence_reject",
  "evidence_normalize",
  "model_prompt",
  "model_output",
  "retry",
  "validation_failure",
  "fallback",
  "coverage",
  "answer_path",
  "commit",
  "final_response",
];

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-black/40 p-3 text-xs leading-relaxed text-zinc-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ChainStep({
  label,
  summary,
  payload,
}: {
  label: string;
  summary?: string;
  payload: unknown;
}) {
  return (
    <div className="border-l-2 border-blue-500/50 pl-4 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-blue-300/90">
        {label}
      </div>
      {summary ? (
        <p className="mt-1 text-sm text-zinc-300">{summary}</p>
      ) : null}
      <JsonBlock value={payload} />
    </div>
  );
}

function TraceDetail({ trace }: { trace: TurnTrace }) {
  const [stageFilter, setStageFilter] = useState<string>("");
  const [taskFilter, setTaskFilter] = useState("");
  const [failureFilter, setFailureFilter] = useState("");

  const chainView = useMemo(() => buildRetrievalChainView(trace), [trace]);

  const taskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of trace.events) {
      if (e.taskId) ids.add(e.taskId);
    }
    return [...ids].sort();
  }, [trace.events]);

  const filteredEvents = useMemo(
    () =>
      filterTraceEvents(trace, {
        stage: stageFilter || undefined,
        taskId: taskFilter || undefined,
        failureType: failureFilter || undefined,
      }),
    [trace, stageFilter, taskFilter, failureFilter],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Trace {trace.traceId}</h2>
        <p className="text-sm text-zinc-400">
          {trace.runtime === "cloud" ? "Cloud V2" : "Local FM"} ·{" "}
          {trace.latencyMs != null ? `${trace.latencyMs}ms` : "in progress"} ·{" "}
          {trace.events.length} events · thread {trace.threadId ?? "—"}
        </p>
        <p className="text-sm text-zinc-300">&ldquo;{trace.userInput}&rdquo;</p>
      </header>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">
          Retrieval → answer chain
        </h3>
        {chainView.divergenceHints.length ? (
          <ul className="mb-4 space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            {chainView.divergenceHints.map((hint) => (
              <li key={hint}>⚠ {hint}</li>
            ))}
          </ul>
        ) : null}
        <div className="space-y-4">
          {chainView.links.map((link, i) => (
            <ChainStep
              key={`${link.step}-${link.at}-${i}`}
              label={link.step.replace(/_/g, " ")}
              summary={link.summary}
              payload={link.payload}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">Event filters</h3>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          >
            <option value="">All tasks</option>
            {taskIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <input
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            placeholder="failure type"
            value={failureFilter}
            onChange={(e) => setFailureFilter(e.target.value)}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">
          Structured events ({filteredEvents.length})
        </h3>
        <div className="max-h-[32rem] space-y-2 overflow-auto">
          {filteredEvents.map((event) => (
            <details
              key={event.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/80 p-3"
            >
              <summary className="cursor-pointer text-sm text-zinc-200">
                <span className="font-mono text-blue-300">{event.stage}</span>
                {event.taskId ? (
                  <span className="ml-2 text-zinc-500">task:{event.taskId}</span>
                ) : null}
                {event.decision ? (
                  <span className="ml-2 text-zinc-400">{event.decision}</span>
                ) : null}
                {event.durationMs != null ? (
                  <span className="ml-2 text-zinc-600">{event.durationMs}ms</span>
                ) : null}
                {event.failureType ? (
                  <span className="ml-2 text-red-400">{event.failureType}</span>
                ) : null}
              </summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {event.input !== undefined ? (
                  <div>
                    <div className="mb-1 text-xs text-zinc-500">input</div>
                    <JsonBlock value={event.input} />
                  </div>
                ) : null}
                {event.output !== undefined ? (
                  <div>
                    <div className="mb-1 text-xs text-zinc-500">output</div>
                    <JsonBlock value={event.output} />
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

export function TurnTraceViewer() {
  const [summaries, setSummaries] = useState<TurnTraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [traceFilter, setTraceFilter] = useState("");

  useEffect(() => subscribeTurnTraces(setSummaries), []);

  const loadCloud = useCallback(async () => {
    try {
      await fetchAllPersistedTurnTraces(50);
    } catch {
      /* auth or migration not applied yet */
    }
  }, []);

  useEffect(() => {
    void loadCloud();
  }, [loadCloud]);

  const refresh = useCallback(() => {
    void loadCloud();
  }, [loadCloud]);

  useEffect(() => {
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = traceFilter.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (s) =>
        s.traceId.toLowerCase().includes(q) ||
        s.userInputPreview.toLowerCase().includes(q) ||
        s.failureReason?.toLowerCase().includes(q),
    );
  }, [summaries, traceFilter]);

  const selectedTrace = selectedId ? getTurnTrace(selectedId) : null;

  useEffect(() => {
    if (!selectedId && filtered.length) {
      setSelectedId(filtered[0].traceId);
    }
  }, [filtered, selectedId]);

  return (
    <div className="flex min-h-[80vh] gap-4">
      <aside className="w-72 shrink-0 space-y-3">
        <input
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Filter traces…"
          value={traceFilter}
          onChange={(e) => setTraceFilter(e.target.value)}
        />
        <div className="max-h-[70vh] space-y-1 overflow-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No traces yet. Send a chat message with DevTools open or visit this
              page while chatting.
            </p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.traceId}
                type="button"
                onClick={() => setSelectedId(s.traceId)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedId === s.traceId
                    ? "border-blue-500/60 bg-blue-500/10 text-zinc-100"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                <div className="truncate font-mono text-xs text-zinc-500">
                  {s.runtime === "cloud" ? "☁ " : "📱 "}
                  {s.traceId.slice(0, 8)}…
                </div>
                <div className="truncate">{s.userInputPreview}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {s.eventCount} evt · {s.latencyMs ?? "?"}ms
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
        {selectedTrace ? (
          <TraceDetail trace={selectedTrace} />
        ) : (
          <p className="text-sm text-zinc-500">Select a trace to inspect the pipeline.</p>
        )}
      </main>
    </div>
  );
}
