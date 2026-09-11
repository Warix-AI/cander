"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import type { Checkpoint } from "@/lib/types";

function formatCommitAt(iso: string | null): { at: string; day: string } {
  if (!iso) return { at: "", day: "Draft" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { at: "", day: "Draft" };
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const at = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = sameDay
    ? "Today"
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
  return { at, day };
}

function commitsToCheckpoints(
  commits: Array<{
    sha: string;
    shortSha: string;
    title: string;
    message: string;
    authorDate: string | null;
  }>,
): Checkpoint[] {
  return commits.map((c) => {
    const { at, day } = formatCommitAt(c.authorDate);
    const body = c.message.includes("\n")
      ? c.message.split("\n").slice(1).join("\n").trim()
      : "";
    return {
      id: c.sha,
      title: c.title,
      at: at || c.shortSha,
      day,
      summary: body || `Draft revision ${c.shortSha}`,
      files: [],
      diff: c.shortSha,
      sha: c.sha,
      shortSha: c.shortSha,
    };
  });
}

/**
 * Changes timeline — backed by cander/draft git SHAs when Build infra is live.
 */
export function ChangeTimeline() {
  const {
    checkpoints,
    restoreCheckpoint,
    projectId,
    refreshPreview,
    setBuildTool,
  } = useApp();
  const ctx = useWorkspaceCtx();
  const [openId, setOpenId] = useState<string | null>(null);
  const [gitItems, setGitItems] = useState<Checkpoint[] | null>(null);
  const [tipSha, setTipSha] = useState<string | null>(null);
  const [draftBranch, setDraftBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadCommits = useCallback(() => {
    if (!projectId || !ctx.workspaceId) return;
    setLoading(true);
    setError(null);
    void import("@/lib/api/project-git-client").then(async (m) => {
      const result = await m.listProjectDraftCommitsClient({
        projectId,
        workspaceId: ctx.workspaceId,
        limit: 40,
      });
      setLoading(false);
      if (!result) {
        setGitItems(null);
        return;
      }
      if (!result.ok) {
        setError(result.error || "Could not load revisions.");
        setGitItems([]);
        return;
      }
      setDraftBranch(result.draftBranch);
      setTipSha(result.tipSha);
      setGitItems(commitsToCheckpoints(result.commits));
    });
  }, [projectId, ctx.workspaceId]);

  useEffect(() => {
    loadCommits();
  }, [loadCommits]);

  const items = useMemo(() => {
    if (gitItems && gitItems.length > 0) return gitItems;
    if (gitItems && gitItems.length === 0 && !error) {
      return [];
    }
    if (checkpoints.length) return checkpoints;
    if (loading || gitItems === null) return [];
    return [
      {
        id: "seed",
        title: "No draft revisions yet",
        at: "",
        day: "Draft",
        summary:
          "Every saved change to your draft will show up here.",
        files: [],
      } satisfies Checkpoint,
    ];
  }, [gitItems, checkpoints, loading, error]);

  const grouped = useMemo(() => {
    const map = new Map<string, Checkpoint[]>();
    for (const item of items) {
      const day = item.day || "Draft";
      const list = map.get(day) ?? [];
      list.push(item);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [items]);

  const onRestore = async (item: Checkpoint) => {
    if (item.sha && projectId && ctx.workspaceId) {
      setRestoring(item.sha);
      setError(null);
      const m = await import("@/lib/api/project-git-client");
      const result = await m.restoreProjectDraftShaClient({
        projectId,
        workspaceId: ctx.workspaceId,
        sha: item.sha,
      });
      setRestoring(null);
      if (!result?.ok) {
        setError(result?.error || "Restore failed.");
        return;
      }
      setTipSha(result.draftSha ?? item.sha);
      refreshPreview();
      setBuildTool("preview");
      loadCommits();
      return;
    }
    restoreCheckpoint(item.id);
  };

  return (
    <div className="px-4 py-4">
      {draftBranch ? (
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground">
          {draftBranch}
          {tipSha ? ` · tip ${tipSha.slice(0, 7)}` : ""}
        </p>
      ) : null}
      {loading && !items.length ? (
        <p className="text-[13px] text-muted-foreground">Loading revisions…</p>
      ) : null}
      {error ? (
        <p className="mb-3 text-[13px] text-muted-foreground">{error}</p>
      ) : null}
      {grouped.map(([day, dayItems]) => (
        <div key={day} className="mb-6">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            {day}
          </p>
          <ol className="mt-4 space-y-5">
            {dayItems.map((item) => {
              const open = openId === item.id;
              const isTip =
                Boolean(item.sha) &&
                tipSha &&
                item.sha?.toLowerCase() === tipSha.toLowerCase();
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    className="w-full text-left"
                  >
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {item.at}
                      {item.shortSha ? ` · ${item.shortSha}` : ""}
                      {isTip ? " · tip" : ""}
                    </p>
                    <p className="mt-0.5 text-[14px] font-medium tracking-[-0.02em]">
                      {item.title}
                    </p>
                  </button>
                  {open ? (
                    <div className="mt-2 rounded-[10px] border border-border bg-card p-3">
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {item.summary}
                      </p>
                      {item.files.length ? (
                        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                          {item.files.join(" · ")}
                        </p>
                      ) : null}
                      {item.sha ? (
                        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                          {item.sha}
                        </p>
                      ) : item.diff ? (
                        <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-muted-foreground">
                          {item.diff}
                        </pre>
                      ) : null}
                      {item.id !== "seed" ? (
                        <button
                          type="button"
                          disabled={Boolean(restoring) || Boolean(isTip)}
                          onClick={() => void onRestore(item)}
                          className="mt-3 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-medium hover:bg-accent disabled:opacity-50"
                        >
                          {restoring === item.sha
                            ? "Restoring…"
                            : isTip
                              ? "Current tip"
                              : "Restore"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
