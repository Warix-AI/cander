"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  LoaderCircle,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  applyAgentConfigPatchClient,
  loadAgentBundleClient,
  runAgentClient,
  updateProjectAgentClient,
} from "@/lib/agents/client";
import {
  peekCachedAgentBundle,
  subscribeAgentBundleCache,
} from "@/lib/agents/cache";
import {
  buildScheduleTrigger,
  type SchedulePreset,
} from "@/lib/agents/schedule";
import type {
  AgentConfigPatch,
  AgentRun,
  AgentStatus,
  AgentTrigger,
  ProjectAgentBundle,
} from "@/lib/agents/types";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { policyFor } from "@/lib/workspace-policy";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import { AgentInspector } from "./builder/AgentInspector";
import { Field, TextArea } from "./builder/fields";

type SaveState = "idle" | "saving" | "saved" | "error";
type ConfigTab =
  | "skills"
  | "access"
  | "knowledge"
  | "trigger"
  | "runs"
  | "agent";

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
  const [tab, setTab] = useState<ConfigTab>("skills");
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const savedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const knowledgeBases = policyFor(workspaceId).knowledgeBases;

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
    setTab("skills");
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

    void fetchConnectorConnections(workspaceId)
      .then((conns) => {
        if (cancelled) return;
        setConnections(conns.filter((c) => c.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
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
    const map = new Map<string, boolean>();
    for (const t of bundle?.tools ?? []) {
      map.set(`${t.connectionId}:${t.toolId}`, t.enabled);
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
      setRunMessage(
        result.run.status === "completed"
          ? result.run.summary || "Run completed."
          : result.run.error || "Run finished with issues.",
      );
      const refreshed = await loadAgentBundleClient({
        workspaceId,
        projectId,
        agentId,
        force: true,
      });
      setBundle(refreshed);
      setTab("runs");
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

  const inspectorTab =
    tab === "trigger" || tab === "runs"
      ? "skills"
      : tab === "agent"
        ? "agent"
        : tab;

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
              "Skills define behavior · Tools define capability · Triggers wake the AI"}
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
          Run
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
            ["skills", "Skills"],
            ["access", "Access"],
            ["knowledge", "Knowledge"],
            ["trigger", "Trigger"],
            ["runs", "Runs"],
            ["agent", "Identity"],
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
        {tab === "trigger" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <TriggerEditor
              trigger={bundle.agent.trigger}
              nextRunAt={bundle.agent.nextRunAt}
              busy={saveState === "saving"}
              onSave={(trigger) => void applyPatch({ trigger, status: "active" })}
            />
          </div>
        ) : tab === "runs" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <RunsList runs={bundle.runs ?? []} />
          </div>
        ) : tab === "skills" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <SkillsConfig
              skills={bundle.skills}
              busy={saveState === "saving"}
              onCreate={(name, markdown) =>
                void applyPatch({ createSkill: { name, markdown } })
              }
              onUpdate={(skillId, markdown, name) =>
                void applyPatch({
                  updateSkill: { skillId, markdown, name },
                })
              }
              onRemove={(skillId) =>
                void applyPatch({ removeSkillIds: [skillId] })
              }
            />
          </div>
        ) : (
          <AgentInspector
            tab={inspectorTab as "agent" | "access" | "skills" | "knowledge"}
            onTabChange={(next) => setTab(next)}
            agent={bundle.agent}
            skills={bundle.skills}
            knowledge={bundle.knowledge}
            knowledgeBases={knowledgeBases}
            connections={connections}
            connectorEnabled={connectorEnabled}
            toolMap={toolMap}
            busy={saveState === "saving"}
            hideTabs
            onSaveIdentity={(patch) => void saveIdentity(patch)}
            onPatch={(patch) => void applyPatch(patch)}
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

function SkillsConfig({
  skills,
  busy,
  onCreate,
  onUpdate,
  onRemove,
}: {
  skills: ProjectAgentBundle["skills"];
  busy: boolean;
  onCreate: (name: string, markdown: string) => void;
  onUpdate: (skillId: string, markdown: string, name?: string) => void;
  onRemove: (skillId: string) => void;
}) {
  const primary = skills[0];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Skills</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          The skill is the program. It tells the AI what to do; Access decides
          what it can do.
        </p>
      </div>

      {primary?.skill ? (
        <div className="space-y-3 rounded-[12px] border border-border p-3">
          <Field
            label="Skill name"
            defaultValue={primary.skill.name}
            disabled={busy}
            onCommit={(name) =>
              onUpdate(primary.skillId, primary.skill!.markdown, name)
            }
          />
          <TextArea
            label="Skill markdown"
            defaultValue={primary.skill.markdown}
            disabled={busy}
            rows={14}
            placeholder="# Lead Follow-up&#10;&#10;When this skill runs:…"
            onCommit={(markdown) => onUpdate(primary.skillId, markdown)}
          />
          {skills.length > 1 ? (
            <p className="text-[12px] text-muted-foreground">
              +{skills.length - 1} more attached skill
              {skills.length > 2 ? "s" : ""}.
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="text-[12px] text-destructive hover:underline disabled:opacity-50"
            onClick={() => onRemove(primary.skillId)}
          >
            Remove skill
          </button>
        </div>
      ) : (
        <div className="rounded-[12px] border border-dashed border-border px-4 py-8 text-center">
          <p className="text-[13px] text-muted-foreground">
            No skills yet. Create one to define this agent’s job.
          </p>
          <button
            type="button"
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[12.5px] font-medium text-background"
            onClick={() =>
              onCreate(
                "Primary skill",
                "# Skill\n\nWhen this skill runs:\n\n1. …\n",
              )
            }
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
            Create skill
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        onClick={() => {
          const draft = window.prompt(
            "Describe what this agent should do (we'll turn it into a skill):",
          );
          if (!draft?.trim()) return;
          onCreate(
            "Generated skill",
            `# Skill\n\nWhen this skill runs:\n\n${draft.trim()}`,
          );
        }}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
        Generate skill from description
      </button>
    </div>
  );
}

function TriggerEditor({
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
      ? ((trigger.preset as SchedulePreset) ?? "weekday")
      : "weekday",
  );
  const [time, setTime] = useState(
    trigger.type === "schedule" ? (trigger.time ?? "09:00") : "09:00",
  );
  const [timezone, setTimezone] = useState(
    trigger.type === "schedule"
      ? trigger.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver",
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Trigger</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          When the agent wakes up. Active agents can always be run manually.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["manual", "Manual"],
            ["schedule", "Schedule"],
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
              <option value="hourly">Every hour</option>
              <option value="daily">Every day</option>
              <option value="weekday">Every weekday</option>
              <option value="weekly">Every week</option>
            </select>
          </label>
          {preset !== "hourly" ? (
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
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          This agent only runs when you press Run (or ask in chat).
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
          onSave(buildScheduleTrigger({ preset, time, timezone }));
        }}
      >
        Save trigger
      </button>
    </div>
  );
}

function RunsList({ runs }: { runs: AgentRun[] }) {
  if (!runs.length) {
    return (
      <div className="mx-auto max-w-md py-10 text-center text-[13px] text-muted-foreground">
        No runs yet. Press Run or wait for a scheduled trigger.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg space-y-2">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Runs</h2>
      {runs.map((run) => (
        <div
          key={run.id}
          className="rounded-[12px] border border-border px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium capitalize">
              {run.status}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {new Date(run.startedAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {run.triggerType}
          </p>
          {run.summary ? (
            <p className="mt-1.5 text-[12.5px] text-foreground/90">{run.summary}</p>
          ) : null}
          {run.error ? (
            <p className="mt-1 text-[12.5px] text-destructive">{run.error}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
