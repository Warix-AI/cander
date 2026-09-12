"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, Play } from "lucide-react";
import {
  applyAgentConfigPatchClient,
  listUserConnectorConnectionsClient,
  loadAgentBundleClient,
  runAgentClient,
  setAgentScopeClient,
  updateProjectAgentClient,
} from "@/lib/agents/client";
import {
  peekCachedAgentBundle,
  subscribeAgentBundleCache,
} from "@/lib/agents/cache";
import {
  buildScheduleTrigger,
  coerceSchedulePreset,
  SCHEDULE_PRESET_LABELS,
  type SchedulePreset,
} from "@/lib/agents/schedule";
import type {
  AgentConfigPatch,
  AgentStatus,
  AgentTrigger,
  ProjectAgentBundle,
} from "@/lib/agents/types";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import { Field, TextArea } from "./builder/fields";

type SaveState = "idle" | "saving" | "saved" | "error";
type ConfigTab = "instructions" | "schedule" | "scope";

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
  const [loading, setLoading] = useState(() => !cachedBundle);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [tab, setTab] = useState<ConfigTab>("instructions");
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const savedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setRunMessage(
        result.run.status === "completed"
          ? result.run.summary || "Wake completed — see Overview for the chat."
          : result.run.error || "Run finished with issues.",
      );
      const refreshed = await loadAgentBundleClient({
        workspaceId,
        projectId,
        agentId,
        force: true,
      });
      setBundle(refreshed);
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
              "Instructions + Schedule + Scope · Chat configures this agent"}
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
            ["schedule", "Schedule"],
            ["scope", "Scope"],
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "instructions" ? (
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
        ) : tab === "schedule" ? (
          <ScheduleEditor
            trigger={bundle.agent.trigger}
            nextRunAt={bundle.agent.nextRunAt}
            busy={saveState === "saving"}
            onSave={(trigger) =>
              void applyPatch({ trigger, status: "active" })
            }
          />
        ) : (
          <ScopeEditor
            workspaceId={workspaceId}
            projectId={projectId}
            agentId={agentId}
            selectedIds={(bundle.scope ?? []).map((s) => s.connectionId)}
            busy={saveState === "saving"}
            onSave={(connectionIds) =>
              void runSave(async () => {
                const scope = await setAgentScopeClient({
                  workspaceId,
                  projectId,
                  agentId,
                  connectionIds,
                });
                setBundle((prev) => (prev ? { ...prev, scope } : prev));
              })
            }
          />
        )}
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
          Purpose, rules, and what this agent should ask Cander to do. You can
          also change this from the chat on the left.
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
        placeholder="# Buddy&#10;&#10;When you wake up, ask Cander to…"
        onCommit={(value) => onSaveInstructions(value)}
      />
    </div>
  );
}

function ScheduleEditor({
  trigger,
  nextRunAt,
  busy,
  onSave,
}: {
  trigger: AgentTrigger;
  nextRunAt: string | null;
  busy: boolean;
  onSave: (trigger: AgentTrigger) => void;
}) {
  const [mode, setMode] = useState<"manual" | "schedule">(
    trigger.type === "schedule" ? "schedule" : "manual",
  );
  const [preset, setPreset] = useState<SchedulePreset>(
    trigger.type === "schedule"
      ? coerceSchedulePreset(trigger.preset)
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
  const [customCron, setCustomCron] = useState(
    trigger.type === "schedule" && trigger.preset === "custom"
      ? trigger.cron
      : "0 * * * *",
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Schedule</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          When this agent wakes and talks to Cander. Run now always works.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["manual", "Manual"],
            ["schedule", "Recurring"],
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
              {(Object.keys(SCHEDULE_PRESET_LABELS) as SchedulePreset[]).map(
                (p) => (
                  <option key={p} value={p}>
                    {SCHEDULE_PRESET_LABELS[p]}
                  </option>
                ),
              )}
            </select>
          </label>
          {preset === "daily" || preset === "custom" ? (
            <Field
              label="At"
              value={time}
              onChange={setTime}
              disabled={busy}
              placeholder="09:00"
            />
          ) : null}
          {preset === "custom" ? (
            <Field
              label="Cron"
              value={customCron}
              onChange={setCustomCron}
              disabled={busy}
              placeholder="0 * * * *"
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
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          This agent only wakes when you press Run now.
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        className="rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background disabled:opacity-50"
        onClick={() => {
          if (mode === "manual") {
            onSave({ type: "manual" });
            return;
          }
          onSave(
            buildScheduleTrigger({
              preset,
              time,
              timezone,
              cron: preset === "custom" ? customCron : undefined,
            }),
          );
        }}
      >
        Save schedule
      </button>
    </div>
  );
}

function ScopeEditor({
  workspaceId,
  selectedIds,
  busy,
  onSave,
}: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  selectedIds: string[];
  busy: boolean;
  onSave: (connectionIds: string[]) => void;
}) {
  const [connections, setConnections] = useState<
    Array<{ id: string; connectorId: string; label: string }>
  >([]);
  const [picked, setPicked] = useState<string[]>(selectedIds);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setPicked(selectedIds);
  }, [selectedIds]);

  useEffect(() => {
    let cancelled = false;
    void listUserConnectorConnectionsClient({ workspaceId })
      .then((rows) => {
        if (!cancelled) setConnections(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load connections.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const toggle = (id: string) => {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <h2 className="text-[14px] font-semibold tracking-[-0.02em]">Scope</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Which Cander resources may this Agent ask about? Leave empty to allow
          all of your connected apps. This is not agent-owned tools — Cander
          still executes everything.
        </p>
      </div>

      {loadError ? (
        <p className="text-[12.5px] text-destructive">{loadError}</p>
      ) : null}

      {!connections.length && !loadError ? (
        <p className="text-[12.5px] text-muted-foreground">
          No active connections yet. Connect apps under Connectors, then return
          here.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border">
          {connections.map((conn) => {
            const on = picked.includes(conn.id);
            return (
              <li key={conn.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy}
                    onChange={() => toggle(conn.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {conn.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase">
                    {conn.connectorId}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[12px] text-muted-foreground">
        {picked.length === 0
          ? "Current: all user connectors"
          : `Current: ${picked.length} connection${picked.length === 1 ? "" : "s"}`}
      </p>

      <button
        type="button"
        disabled={busy}
        className="rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background disabled:opacity-50"
        onClick={() => onSave(picked)}
      >
        Save scope
      </button>
    </div>
  );
}
