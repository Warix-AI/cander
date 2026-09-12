"use client";

import { useEffect, useState } from "react";
import { Activity, LoaderCircle, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { fetchWorkspaceAgentActivityClient } from "@/lib/agents/client";
import type { AgentActivityItem } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
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

function statusTone(status: string) {
  if (status === "completed") return "text-foreground";
  if (status === "waiting" || status === "running")
    return "text-amber-700 dark:text-amber-400";
  if (status === "failed") return "text-destructive";
  return "text-muted-foreground";
}

/** Global Agents Activity feed (sidebar → Activity). */
export function AgentsActivityModal() {
  const { overlay, closeOverlay, workspaceId, openProject } = useApp();
  const open = overlay === "agents-activity";
  const [items, setItems] = useState<AgentActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchWorkspaceAgentActivityClient({ workspaceId, limit: 50 })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load activity.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={closeOverlay}
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Agents Activity"
        className="relative z-[1] flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-[16px] border border-border bg-background shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <Activity className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
          <h2 className="flex-1 text-[15px] font-semibold tracking-[-0.02em]">
            Agents Activity
          </h2>
          <button
            type="button"
            onClick={closeOverlay}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={1.7} />
              Loading…
            </div>
          ) : error ? (
            <p className="px-3 py-8 text-center text-[13px] text-destructive">
              {error}
            </p>
          ) : !items.length ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              No agent activity yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left hover:bg-muted/70"
                    onClick={() => {
                      closeOverlay();
                      openProject(item.projectId, {
                        agentSurface: "overview",
                        landOnPanel: true,
                      });
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">
                          {item.agentName}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] font-medium capitalize",
                            statusTone(item.status),
                          )}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">
                        {item.summary}
                      </p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
                      {formatWhen(item.startedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
