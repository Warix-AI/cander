"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  LoaderCircle,
  Play,
  X,
} from "lucide-react";
import {
  applyAgentConfigPatchClient,
  approveAgentRunClient,
  fetchAgentActivityClient,
  loadAgentBundleClient,
  postAgentActivityMessageClient,
  rejectAgentRunClient,
  reviseAgentRunClient,
  runAgentClient,
  updateProjectAgentClient,
} from "@/lib/agents/client";
import {
  peekCachedAgentBundle,
  subscribeAgentBundleCache,
} from "@/lib/agents/cache";
import {
  buildScheduleTrigger,
  SCHEDULE_PRESET_LABELS,
  type SchedulePreset,
} from "@/lib/agents/schedule";
import type {
  AgentApprovalMode,
  AgentConfigPatch,
  AgentRun,
  AgentRunEvent,
  AgentStatus,
  AgentTrigger,
  ProjectAgentBundle,
} from "@/lib/agents/types";
import { defaultApprovalModeForTool } from "@/lib/agents/types";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import { humanizeConnectorId } from "./builder/humanize";
import { Field, TextArea } from "./builder/fields";

type SaveState = "idle" | "saving" | "saved" | "error";
type ConfigTab = "instructions" | "connections" | "schedule" | "activity";

export function AgentBuilderPanel({
  workspaceId,
  projectId,
  agentId,
  onTitleChange,
}: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  onTitleChange?: (title: string) => void;
}) {
  const cachedBundle = peekCachedAgentBundle(workspaceId, projectId, agentId);
  const [bundle, setBundle] = useState<ProjectAgentBundle | null>(
    () => cachedBundle,
  );
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [loading, setLoading] = useState(() => !cachedBundle);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [tab, setTab] = useState<ConfigTab>("instructions");
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [activity, setActivity] = useState<{
    runs: AgentRun[];
    events: AgentRunEvent[];
  } | null>(null);
  const savedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadActivity = async () => {
    const next = await fetchAgentActivityClient({
      workspaceId,
      projectId,
      agentId,
    });
    setActivity(next);
  };

  useEffect(() => {
    let cancelled = false;
    const peek = peekCachedAgentBundle(workspaceId, projectId, agentId);
    if (peek) {
      setBundle(peek);
      setLoading(false);
    } else {
      setLoading(true);
      setBundle(null);
    }
    setError(null);
    setTab("instructions");
    setSaveState("idle");
    setRunMessage(null);
    setActivity(null);

    void loadAgentBundleClient({ workspaceId, projectId, agentId })
      .then((next) => {
        if (cancelled) return;
        setBundle(next);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load agent.");
        if (!peek) setBundle(null);
        setLoading(false);
      });

    void fetchConnectorConnections(workspaceId)
      .then((conns) => {
        if (cancelled) return;
        setConnections(conns.filter((c) => c.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      });

    void fetchAgentActivityClient({ workspaceId, projectId, agentId })
      .then((next) => {
        if (!cancelled) setActivity(next);
      })
      .catch(() => {
        if (!cancelled) setActivity({ runs: [], events: [] });
      });

    return () => {
      cancelled = true;
      if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
    };
  }, [workspaceId, projectId, agentId]);

  useEffect(() => {
    return subscribeAgentBundleCache((event) => {
      if (
        event.workspaceId !== workspaceId ||
        event.projectId !== projectId ||
        event.agentId !== agentId
      ) {
        return;
      }
      if (event.bundle) {
        setBundle(event.bundle);
        setLoading(false);
        setError(null);
      }
    });
  }, [workspaceId, projectId, agentId]);

  const toolMap = useMemo(() => {
    const map = new Map<
      string,
      { enabled: boolean; approvalMode: AgentApprovalMode }
    >();
    for (const t of bundle?.tools ?? []) {
      map.set(`${t.connectionId}:${t.toolId}`, {
        enabled: t.enabled,
        approvalMode: t.approvalMode,
      });
    }
    return map;
  }, [bundle?.tools]);

  const connectorEnabled = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of bundle?.connectors ?? []) {
      map.set(c.connectionId, c.enabled);
    }
    return map;
  }, [bundle?.connectors]);

  const markSaved = () => {
    setSaveState("saved");
    if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
    savedClearTimer.current = setTimeout(() => setSaveState("idle"), 1600);
  };

  const runSave = async (fn: () => Promise<void>) => {
    setSaveState("saving");
    setError(null);
    try {
      await fn();
      markSaved();
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  };

  const saveIdentity = async (
    patch: Partial<{
      name: string;
      description: string;
      instructions: string;
      enabled: boolean;
      status: AgentStatus;
    }>,
  ) => {
    await runSave(async () => {
      const agent = await updateProjectAgentClient({
        workspaceId,
        projectId,
        agentId,
        patch,
      });
      setBundle((prev) => (prev ? { ...prev, agent } : prev));
      if (patch.name !== undefined) onTitleChange?.(agent.name);
    });
  };

  const applyPatch = async (patch: AgentConfigPatch) => {
    await runSave(async () => {
      const next = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch,
        confirmed: true,
      });
      setBundle(next);
      if (patch.name) onTitleChange?.(next.agent.name);
    });
  };

  const handleRun = async () => {
    if (!bundle || runBusy) return;
    setRunBusy(true);
    setRunMessage(null);
    try {
      const result = await runAgentClient({
        workspaceId,
        projectId,
        agentId,
      });
      const statusLabel =
        result.run.status === "approval_needed"
          ? "Draft ready — needs approval."
          : result.run.status === "completed"
            ? result.run.summary || "Run completed."
            : result.run.error || "Run finished with issues.";
      setRunMessage(statusLabel);
      const refreshed = await loadAgentBundleClient({
        workspaceId,
        projectId,
        agentId,
        force: true,
      });
      setBundle(refreshed);
      await reloadActivity();
      setTab("activity");
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setRunBusy(false);
    }
  };

  if (loading && !bundle) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground",
          BROWSER_CHROME_BG,
        )}
      >
        <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={1.6} />
        Loading agent…
      </div>
    );
  }

  if (!bundle) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center px-6 text-center text-[13px] text-muted-foreground",
          BROWSER_CHROME_BG,
        )}
      >
        {error ?? "Agent not found."}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", BROWSER_CHROME_BG)}>
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-muted">
          <Bot className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[1.05rem] font-semibold tracking-[-0.02em]">
              {bundle.agent.name}
            </h1>
            <StatusSelect
              status={bundle.agent.status}
              busy={saveState === "saving"}
              onChange={(status) => void saveIdentity({ status })}
            />
            <span className="text-[11px] text-muted-foreground">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Error"
                    : ""}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {bundle.agent.description ||
              "Instructions · Connections · Schedule · Activity"}
          </p>
        </div>
        <button
          type="button"
          disabled={runBusy || bundle.agent.status === "paused"}
          onClick={() => void handleRun()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-medium text-background disabled:opacity-50"
        >
          {runBusy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
          ) : (
            <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
          Run now
        </button>
      </header>

      {error || runMessage ? (
        <div className="shrink-0 border-b border-border px-4 py-2 text-[12.5px] text-muted-foreground">
          {error ?? runMessage}
        </div>
      ) : null}

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
        {(
          [
            ["instructions", "Instructions"],
            ["connections", "Connections"],
            ["schedule", "Schedule"],
            ["activity", "Activity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background"
                : "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "instructions" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <InstructionsEditor
              name={bundle.agent.name}
              description={bundle.agent.description}
              instructions={bundle.agent.instructions}
              busy={saveState === "saving"}
              onSaveIdentity={(patch) => void saveIdentity(patch)}
              onSaveInstructions={(instructions) =>
                void applyPatch({ instructions })
              }
            />
          </div>
        ) : null}
        {tab === "connections" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <ConnectionsEditor
              connections={connections}
              connectorEnabled={connectorEnabled}
              toolMap={toolMap}
              busy={saveState === "saving"}
              onPatch={(patch) => void applyPatch(patch)}
            />
          </div>
        ) : null}
        {tab === "schedule" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <ScheduleEditor
              trigger={bundle.agent.trigger}
              nextRunAt={bundle.agent.nextRunAt}
              connections={connections}
              busy={saveState === "saving"}
              onSave={(trigger) =>
                void applyPatch({ trigger, status: "active" })
              }
            />
          </div>
        ) : null}
        {tab === "activity" ? (
          <div className="h-full overflow-hidden">
            <ActivityPanel
              workspaceId={workspaceId}
              projectId={projectId}
              agentId={agentId}
              runs={activity?.runs ?? bundle.runs ?? []}
              events={activity?.events ?? []}
              onRefresh={async () => {
                await reloadActivity();
                const refreshed = await loadAgentBundleClient({
                  workspaceId,
                  projectId,
                  agentId,
                  force: true,
                });
                setBundle(refreshed);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusSelect({
  status,
  busy,
  onChange,
}: {
  status: AgentStatus;
  busy: boolean;
  onChange: (status: AgentStatus) => void;
}) {
  return (
    <select
      value={status}
      disabled={busy}
      onChange={(e) => onChange(e.target.value as AgentStatus)}
      className="h-7 rounded-full border border-border bg-background px-2 text-[11.5px] font-medium outline-none"
    >
      <option value="draft">Draft</option>
      <option value="active">Active</option>
      <option value="paused">Paused</option>
    </select>
  );
}

function InstructionsEditor({
  name,
  description,
  instructions,
  busy,
  onSaveIdentity,
  onSaveInstructions,
}: {
  name: string;
  description: string;
  instructions: string;
  busy: boolean;
  onSaveIdentity: (
    patch: Partial<{ name: string; description: string }>,
  ) => void;
  onSaveInstructions: (instructions: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
          Instructions
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Markdown that defines Buddy’s job. Saved into the agent and used in
          every run.
        </p>
      </div>
      <Field
        label="Name"
        defaultValue={name}
        disabled={busy}
        onCommit={(value) => onSaveIdentity({ name: value })}
      />
      <Field
        label="Description"
        defaultValue={description}
        disabled={busy}
        onCommit={(value) => onSaveIdentity({ description: value })}
      />
      <TextArea
        label="Instructions markdown"
        defaultValue={instructions}
        disabled={busy}
        rows={16}
        placeholder="# Buddy&#10;&#10;When a matching email arrives…"
        onCommit={(value) => onSaveInstructions(value)}
      />
    </div>
  );
}

function ConnectionsEditor({
  connections,
  connectorEnabled,
  toolMap,
  busy,
  onPatch,
}: {
  connections: ConnectorConnection[];
  connectorEnabled: Map<string, boolean>;
  toolMap: Map<string, { enabled: boolean; approvalMode: AgentApprovalMode }>;
  busy: boolean;
  onPatch: (patch: AgentConfigPatch) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const gmail = connections.filter((c) => c.connectorId === "gmail");
  const other = connections.filter((c) => c.connectorId !== "gmail");
  const ordered = [...gmail, ...other];

  if (!ordered.length) {
    return (
      <div className="mx-auto max-w-md py-10 text-center text-[13px] text-muted-foreground">
        Connect Gmail (or other apps) under Connectors, then grant specific
        accounts and tools here.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
          Connections
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Pick a specific account, enable tools, and set approval for sends.
        </p>
      </div>
      {ordered.map((conn) => {
        const enabled = connectorEnabled.get(conn.id) ?? false;
        const open = expanded === conn.id || enabled;
        const tools = toolsForConnector(conn.connectorId);
        return (
          <div key={conn.id} className="rounded-[12px] border border-border">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setExpanded(open ? null : conn.id)}
              >
                <span className="block truncate text-[13px] font-medium">
                  {humanizeConnectorId(conn.connectorId)}
                </span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {conn.connectionMode === "workspace_shared"
                    ? "Shared workspace connection"
                    : "Personal connection"}{" "}
                  · {conn.id.slice(0, 10)}
                </span>
              </button>
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={(event) => {
                  const on = event.target.checked;
                  setExpanded(on ? conn.id : null);
                  onPatch({
                    setConnectorEnabled: [
                      {
                        connectionId: conn.id,
                        connectorId: conn.connectorId,
                        enabled: on,
                      },
                    ],
                    ...(on && conn.connectorId === "gmail"
                      ? {
                          setToolPermissions: tools.map((tool) => ({
                            connectionId: conn.id,
                            toolId: tool.id,
                            enabled:
                              tool.access === "read" ||
                              tool.id === "gmail.draft" ||
                              tool.id === "gmail.reply" ||
                              tool.id === "gmail.send",
                            approvalMode: defaultApprovalModeForTool(tool.id),
                          })),
                        }
                      : {}),
                  });
                }}
              />
            </div>
            {open ? (
              <div className="space-y-2 border-t border-border px-3 py-2.5">
                {tools.map((tool) => {
                  const state = toolMap.get(`${conn.id}:${tool.id}`);
                  const on = state?.enabled ?? false;
                  const mode =
                    state?.approvalMode ?? defaultApprovalModeForTool(tool.id);
                  return (
                    <div
                      key={tool.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]"
                    >
                      <label className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={busy}
                          onChange={(event) =>
                            onPatch({
                              setToolPermissions: [
                                {
                                  connectionId: conn.id,
                                  toolId: tool.id,
                                  enabled: event.target.checked,
                                  approvalMode: mode,
                                },
                              ],
                            })
                          }
                        />
                        <span className="truncate">{tool.label}</span>
                      </label>
                      {on ? (
                        <select
                          value={mode}
                          disabled={busy}
                          className="h-7 rounded-[8px] border border-border bg-background px-1.5 text-[11px]"
                          onChange={(event) =>
                            onPatch({
                              setToolPermissions: [
                                {
                                  connectionId: conn.id,
                                  toolId: tool.id,
                                  enabled: true,
                                  approvalMode: event.target
                                    .value as AgentApprovalMode,
                                },
                              ],
                            })
                          }
                        >
                          <option value="auto">Auto</option>
                          <option value="draft">Draft</option>
                          <option value="require_approval">
                            Require approval
                          </option>
                        </select>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleEditor({
  trigger,
  nextRunAt,
  connections,
  busy,
  onSave,
}: {
  trigger: AgentTrigger;
  nextRunAt: string | null;
  connections: ConnectorConnection[];
  busy: boolean;
  onSave: (trigger: AgentTrigger) => void;
}) {
  const gmailConnections = connections.filter((c) => c.connectorId === "gmail");
  const [mode, setMode] = useState<"manual" | "schedule" | "gmail_new_message">(
    trigger.type === "schedule"
      ? "schedule"
      : trigger.type === "gmail_new_message"
        ? "gmail_new_message"
        : "manual",
  );
  const [preset, setPreset] = useState<SchedulePreset>(
    trigger.type === "schedule"
      ? ((trigger.preset as SchedulePreset) ?? "hourly")
      : "hourly",
  );
  const [time, setTime] = useState(
    trigger.type === "schedule" ? (trigger.time ?? "09:00") : "09:00",
  );
  const [timezone, setTimezone] = useState(
    trigger.type === "schedule"
      ? trigger.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver",
  );
  const [gmailConnectionId, setGmailConnectionId] = useState(
    trigger.type === "gmail_new_message"
      ? trigger.connectionId
      : (gmailConnections[0]?.id ?? ""),
  );
  const [fromContains, setFromContains] = useState(
    trigger.type === "gmail_new_message"
      ? (trigger.filter.fromContains ?? "")
      : "",
  );
  const [query, setQuery] = useState(
    trigger.type === "gmail_new_message" ? (trigger.filter.query ?? "") : "",
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Schedule</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          One active wake condition. You can always press Run now.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["manual", "Manual"],
            ["schedule", "On a schedule"],
            ["gmail_new_message", "New Gmail message"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={busy}
            onClick={() => setMode(id)}
            className={
              mode === id
                ? "rounded-full bg-foreground px-3 py-1.5 text-[12.5px] font-medium text-background"
                : "rounded-full border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "schedule" ? (
        <div className="space-y-3 rounded-[12px] border border-border p-3">
          <label className="block">
            <span className="font-mono text-[11px] text-muted-foreground">
              Run
            </span>
            <select
              value={preset}
              disabled={busy}
              onChange={(e) => setPreset(e.target.value as SchedulePreset)}
              className="mt-1 h-9 w-full rounded-[10px] border border-border bg-background px-3 text-[13px]"
            >
              {(Object.keys(SCHEDULE_PRESET_LABELS) as SchedulePreset[])
                .filter((p) => p !== "custom")
                .map((p) => (
                  <option key={p} value={p}>
                    {SCHEDULE_PRESET_LABELS[p]}
                  </option>
                ))}
            </select>
          </label>
          {preset !== "hourly" && preset !== "every_few_hours" ? (
            <Field
              label="At"
              value={time}
              onChange={setTime}
              disabled={busy}
              placeholder="09:00"
            />
          ) : null}
          <Field
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
            disabled={busy}
          />
          {nextRunAt ? (
            <p className="text-[12px] text-muted-foreground">
              Next run: {new Date(nextRunAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "gmail_new_message" ? (
        <div className="space-y-3 rounded-[12px] border border-border p-3">
          {!gmailConnections.length ? (
            <p className="text-[12.5px] text-muted-foreground">
              Connect a Gmail account first, then enable it under Connections.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="font-mono text-[11px] text-muted-foreground">
                  Gmail account
                </span>
                <select
                  value={gmailConnectionId}
                  disabled={busy}
                  onChange={(e) => setGmailConnectionId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-background px-3 text-[13px]"
                >
                  {gmailConnections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.connectionMode === "workspace_shared"
                        ? "Shared"
                        : "Personal"}{" "}
                      · {c.id.slice(0, 12)}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="From contains"
                value={fromContains}
                onChange={setFromContains}
                disabled={busy}
                placeholder="boss@company.com"
              />
              <Field
                label="Extra Gmail query"
                value={query}
                onChange={setQuery}
                disabled={busy}
                placeholder="subject:invoice"
              />
            </>
          )}
        </div>
      ) : null}

      {mode === "manual" ? (
        <p className="text-[12.5px] text-muted-foreground">
          This agent only runs when you press Run now (or ask in Activity).
        </p>
      ) : null}

      <button
        type="button"
        disabled={
          busy ||
          (mode === "gmail_new_message" &&
            (!gmailConnectionId || !gmailConnections.length))
        }
        className="rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background disabled:opacity-50"
        onClick={() => {
          if (mode === "manual") {
            onSave({ type: "manual" });
            return;
          }
          if (mode === "schedule") {
            onSave(buildScheduleTrigger({ preset, time, timezone }));
            return;
          }
          onSave({
            type: "gmail_new_message",
            connectionId: gmailConnectionId,
            filter: {
              ...(fromContains.trim()
                ? { fromContains: fromContains.trim() }
                : {}),
              ...(query.trim() ? { query: query.trim() } : {}),
            },
          });
        }}
      >
        Save schedule
      </button>
    </div>
  );
}

function ActivityPanel({
  workspaceId,
  projectId,
  agentId,
  runs,
  events,
  onRefresh,
}: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  runs: AgentRun[];
  events: AgentRunEvent[];
  onRefresh: () => Promise<void>;
}) {
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const eventsByRun = useMemo(() => {
    const map = new Map<string, AgentRunEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.runId) ?? [];
      list.push(ev);
      map.set(ev.runId, list);
    }
    return map;
  }, [events]);

  const pending = runs.find((r) => r.status === "approval_needed");

  const draftForRun = (runId: string) => {
    if (draftEdits[runId] != null) return draftEdits[runId]!;
    const list = eventsByRun.get(runId) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const ev = list[i]!;
      if (
        ev.eventType === "draft_created" ||
        ev.eventType === "revised" ||
        ev.eventType === "approval_needed"
      ) {
        const draft = String(ev.payload.draft ?? "");
        if (draft) return draft;
      }
    }
    return "";
  };

  const submitComposer = async () => {
    const message = composer.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    try {
      await postAgentActivityMessageClient({
        workspaceId,
        projectId,
        agentId,
        message,
      });
      setComposer("");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
            Activity
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Operational timeline — not a normal chat. Approve drafts here.
          </p>
        </div>

        {!runs.length ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No activity yet. Press Run now or wait for a trigger.
          </p>
        ) : (
          runs.map((run) => {
            const runEvents = eventsByRun.get(run.id) ?? [];
            const needsApproval = run.status === "approval_needed";
            const draft = draftForRun(run.id);
            return (
              <div
                key={run.id}
                className="rounded-[12px] border border-border px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium capitalize">
                    {run.status.replace("_", " ")}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {new Date(run.startedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {run.triggerType}
                </p>
                {run.summary ? (
                  <p className="mt-1.5 text-[12.5px] text-foreground/90">
                    {run.summary}
                  </p>
                ) : null}

                <ol className="mt-2 space-y-1 border-t border-border/70 pt-2">
                  {runEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className="text-[11.5px] text-muted-foreground"
                    >
                      <span className="font-medium text-foreground/80">
                        {ev.eventType}
                      </span>
                      {ev.eventType === "tool_called" ? (
                        <span> · {String(ev.payload.tool ?? "")}</span>
                      ) : null}
                      {ev.eventType === "user_message" ? (
                        <span> · {String(ev.payload.text ?? "")}</span>
                      ) : null}
                      {ev.eventType === "revised" && ev.payload.note ? (
                        <span> · {String(ev.payload.note)}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>

                {needsApproval && draft ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) =>
                        setDraftEdits((prev) => ({
                          ...prev,
                          [run.id]: e.target.value,
                        }))
                      }
                      rows={6}
                      className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[12.5px] outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-medium text-background disabled:opacity-50"
                        onClick={() => {
                          setBusy(true);
                          setError(null);
                          void approveAgentRunClient({
                            workspaceId,
                            projectId,
                            agentId,
                            runId: run.id,
                            draft,
                          })
                            .then(() => onRefresh())
                            .catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Approve failed.",
                              ),
                            )
                            .finally(() => setBusy(false));
                        }}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={1.8} />
                        Approve & send
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
                        onClick={() => {
                          setBusy(true);
                          void reviseAgentRunClient({
                            workspaceId,
                            projectId,
                            agentId,
                            runId: run.id,
                            draft,
                          })
                            .then(() => onRefresh())
                            .catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Revise failed.",
                              ),
                            )
                            .finally(() => setBusy(false));
                        }}
                      >
                        Save revise
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-destructive disabled:opacity-50"
                        onClick={() => {
                          setBusy(true);
                          void rejectAgentRunClient({
                            workspaceId,
                            projectId,
                            agentId,
                            runId: run.id,
                          })
                            .then(() => onRefresh())
                            .catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Reject failed.",
                              ),
                            )
                            .finally(() => setBusy(false));
                        }}
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2">
        {pending ? (
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Try “Send it”, “Make it more concise”, or “Pause Buddy”.
          </p>
        ) : null}
        <div className="flex gap-2">
          <input
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitComposer();
              }
            }}
            placeholder="Reply to pending activity…"
            className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-[12.5px] outline-none"
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || !composer.trim()}
            onClick={() => void submitComposer()}
            className="h-9 shrink-0 rounded-full bg-foreground px-3 text-[12.5px] font-medium text-background disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
