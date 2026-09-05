"use client";

import { useEffect, useState } from "react";
import { Bot, LoaderCircle, Pencil } from "lucide-react";
import { listProjectAgentsClient } from "@/lib/agents/client";
import { peekCachedProjectAgents } from "@/lib/agents/cache";
import type { ProjectAgent } from "@/lib/agents/types";
import { cn } from "@/lib/utils";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";

export function AgentOverviewPanel({
  workspaceId,
  projectId,
  projectTitle,
  onEditInProject,
}: {
  workspaceId: string;
  projectId: string;
  projectTitle?: string;
  onEditInProject: () => void;
}) {
  const [agents, setAgents] = useState<ProjectAgent[]>(
    () => peekCachedProjectAgents(workspaceId, projectId) ?? [],
  );
  const [loading, setLoading] = useState(
    () => !peekCachedProjectAgents(workspaceId, projectId),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const peek = peekCachedProjectAgents(workspaceId, projectId);
    if (peek) {
      setAgents(peek);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void listProjectAgentsClient({ workspaceId, projectId })
      .then((list) => {
        if (!cancelled) setAgents(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load agents.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId]);

  const enabledCount = agents.filter((a) => a.enabled).length;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-y-auto px-5 py-6",
        BROWSER_CHROME_BG,
      )}
    >
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-muted">
            <Bot className="h-5 w-5 text-foreground" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              Agent overview
            </p>
            <h1 className="mt-0.5 truncate text-[1.35rem] font-semibold tracking-[-0.03em]">
              {projectTitle ?? "Agent"}
            </h1>
          </div>
        </div>

        {loading ? (
          <div className="mt-10 flex justify-center">
            <LoaderCircle
              className="h-6 w-6 animate-spin text-muted-foreground"
              strokeWidth={1.75}
            />
          </div>
        ) : error ? (
          <p className="mt-6 text-[13px] text-destructive">{error}</p>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <Stat label="Agents" value={String(agents.length)} />
              <Stat label="Enabled" value={String(enabledCount)} />
              <Stat label="Runs (7d)" value="—" />
            </div>

            <div className="mt-6 space-y-2">
              <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Agents in project
              </p>
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-[10px] border border-border bg-background px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">
                      {agent.name}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {agent.description || "No description"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      agent.enabled
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {agent.enabled ? "On" : "Off"}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-6 text-[12.5px] text-muted-foreground">
              This pin is read-only. Edit identity, skills, knowledge, access,
              and routes in the project canvas.
            </p>

            <button
              type="button"
              onClick={onEditInProject}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-foreground"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
              Edit in project
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-background px-3 py-3">
      <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-[1.25rem] font-semibold tracking-[-0.03em]">
        {value}
      </p>
    </div>
  );
}
