"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, LoaderCircle, Pencil, Play } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  fetchAgentConversationClient,
  listProjectAgentsWithStatsClient,
  runAgentClient,
} from "@/lib/agents/client";
import { peekCachedProjectAgents } from "@/lib/agents/cache";
import { notifyAgentRuntimeRefresh } from "@/components/agents/AgentRuntimeTranscript";
import type {
  AgentActivityItem,
  AgentRun,
  ProjectAgent,
} from "@/lib/agents/types";
import {
  SCHEDULE_PRESET_LABELS,
  type SchedulePreset,
} from "@/lib/agents/schedule";
import { cn } from "@/lib/utils";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function scheduleLabel(agent: ProjectAgent | null) {
  if (!agent) return "—";
  if (agent.trigger.type === "manual") return "Manual";
  const preset = agent.trigger.preset as SchedulePreset | undefined;
  if (preset && SCHEDULE_PRESET_LABELS[preset]) {
    return SCHEDULE_PRESET_LABELS[preset];
  }
  return agent.trigger.cron || "Schedule";
}

function statusTone(status: string) {
  if (status === "completed") return "text-foreground";
  if (status === "waiting" || status === "running") return "text-amber-700 dark:text-amber-400";
  if (status === "failed") return "text-destructive";
  return "text-muted-foreground";
}

/** Right panel: Activity outcomes only (dialogue lives in left chat). */
export function AgentOverviewPanel({
  workspaceId,
  projectId,
  projectTitle,
  agentId: preferredAgentId,
  onEditInProject: _onEditInProject,
}: {
  workspaceId: string;
  projectId: string;
  projectTitle?: string;
  /** When set (active Expert tab), load that Expert instead of agents[0]. */
  agentId?: string | null;
  onEditInProject: () => void;
}) {
  const { openProject } = useApp();
  const [agents, setAgents] = useState<ProjectAgent[]>(
    () => peekCachedProjectAgents(workspaceId, projectId) ?? [],
  );
  const [agent, setAgent] = useState<ProjectAgent | null>(null);
  const [activity, setActivity] = useState<AgentActivityItem[]>([]);
  const [runsLast7d, setRunsLast7d] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  const primaryId =
    preferredAgentId ||
    agents.find((a) => a.id === preferredAgentId)?.id ||
    agents[0]?.id ||
    agent?.id ||
    null;

  const reload = async () => {
    const listed = await listProjectAgentsWithStatsClient({
      workspaceId,
      projectId,
      force: true,
    });
    setAgents(listed.agents);
    setRunsLast7d(listed.runsLast7d);
    const id =
      (preferredAgentId &&
        listed.agents.some((a) => a.id === preferredAgentId) &&
        preferredAgentId) ||
      listed.agents[0]?.id;
    if (!id) {
      setAgent(null);
      setActivity([]);
      return;
    }
    const conv = await fetchAgentConversationClient({
      workspaceId,
      projectId,
      agentId: id,
    });
    setAgent(conv.agent);
    setActivity(
      conv.activity.length
        ? conv.activity
        : (conv.runs as AgentRun[]).map((run) => ({
            id: run.id,
            agentId: run.agentId,
            agentName: conv.agent.name,
            projectId: run.projectId,
            workspaceId: run.workspaceId,
            status:
              run.status === "waiting"
                ? "waiting"
                : run.status === "completed"
                  ? "completed"
                  : run.status === "failed"
                    ? "failed"
                    : run.status === "cancelled"
                      ? "cancelled"
                      : "running",
            summary: run.summary || run.error || "No summary.",
            triggerType: run.triggerType,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
          })),
    );
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void reload()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load expert.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on project/expert change
  }, [workspaceId, projectId, preferredAgentId]);

  const latest = activity[0] ?? null;
  const issues = useMemo(
    () => activity.filter((a) => a.status === "failed").slice(0, 3),
    [activity],
  );

  const handleRun = async () => {
    if (!primaryId || runBusy) return;
    setRunBusy(true);
    setError(null);
    notifyAgentRuntimeRefresh({
      projectId,
      agentId: primaryId,
      pending: true,
    });
    try {
      await runAgentClient({
        workspaceId,
        projectId,
        agentId: primaryId,
      });
      await reload();
      notifyAgentRuntimeRefresh({ projectId, agentId: primaryId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed.");
      notifyAgentRuntimeRefresh({ projectId, agentId: primaryId });
    } finally {
      setRunBusy(false);
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", BROWSER_CHROME_BG)}>
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-muted">
          <Bot className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Expert · Activity
          </p>
          <h1 className="truncate text-[1.1rem] font-semibold tracking-[-0.02em]">
            {agent?.name ?? projectTitle ?? "Expert"}
          </h1>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            Outcomes only · dialogue is in the left chat
            {agent?.status ? ` · ${agent.status}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={runBusy || !primaryId || agent?.status === "paused"}
            onClick={() => void handleRun()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-medium text-background disabled:opacity-50"
          >
            {runBusy ? (
              <LoaderCircle
                className="h-3.5 w-3.5 animate-spin"
                strokeWidth={1.8}
              />
            ) : (
              <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
            )}
            Run now
          </button>
          <button
            type="button"
            onClick={() => {
              openProject(projectId, {
                agentSurface: "builder",
                landOnPanel: true,
              });
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] font-medium hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
            Edit
          </button>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-border px-4 py-2 text-[12.5px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoaderCircle
              className="h-6 w-6 animate-spin text-muted-foreground"
              strokeWidth={1.75}
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
            <section className="grid grid-cols-2 gap-3">
              <Stat label="Status" value={agent?.status ?? "—"} />
              <Stat label="Schedule" value={scheduleLabel(agent)} />
              <Stat label="Last wake" value={formatWhen(agent?.lastTriggeredAt)} />
              <Stat label="Next run" value={formatWhen(agent?.nextRunAt)} />
              <Stat label="Runs (7d)" value={String(runsLast7d || activity.length)} />
              <Stat
                label="Latest"
                value={latest?.status ?? "—"}
              />
            </section>

            {issues.length ? (
              <section className="rounded-[12px] border border-border px-3.5 py-3">
                <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
                  Recent issues
                </p>
                <ul className="mt-2 space-y-2 text-[12.5px] text-destructive">
                  {issues.map((item) => (
                    <li key={item.id}>
                      <span className="text-muted-foreground">
                        {formatWhen(item.completedAt ?? item.startedAt)} ·{" "}
                      </span>
                      {item.summary || "Failed"}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <p className="mb-2 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
                Activity
              </p>
              {!activity.length ? (
                <p className="text-[12.5px] text-muted-foreground">
                  No activity yet. Press Run now or wait for the schedule.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-[12px] border border-border">
                  {activity.slice(0, 12).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-[12.5px]"
                    >
                      <div className="min-w-0">
                        <p className={cn("font-medium capitalize", statusTone(item.status))}>
                          {item.status}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {item.summary || item.triggerType}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatWhen(item.startedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border px-3.5 py-3">
      <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-[13.5px] font-medium tracking-[-0.02em]">
        {value}
      </p>
    </div>
  );
}
