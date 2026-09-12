"use client";

import { useEffect, useState } from "react";
import {
  approveAgentRunClient,
  fetchAgentConversationClient,
} from "@/lib/agents/client";
import type { AgentRun } from "@/lib/agents/types";
import { notifyAgentRuntimeRefresh } from "@/components/agents/AgentRuntimeTranscript";

type PendingApproval = {
  type: "confirmation_required";
  toolId: string;
  message?: string;
  preview?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
};

function pendingFromRun(run: AgentRun): PendingApproval | null {
  const raw = run.triggerPayload?.pendingApproval;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as PendingApproval;
  if (row.type !== "confirmation_required" || !row.toolId) return null;
  return row;
}

/** Approve / Reject bar for Expert runtime when a tool is waiting. */
export function ExpertRuntimeApprovalBar(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string | null;
  enabled: boolean;
}) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opts.enabled || !opts.agentId) {
      setRun(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const conv = await fetchAgentConversationClient({
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          agentId: opts.agentId!,
        });
        if (cancelled) return;
        const waiting = conv.runs.find(
          (item) =>
            item.status === "waiting" && pendingFromRun(item),
        );
        setRun(waiting ?? null);
      } catch {
        if (!cancelled) setRun(null);
      }
    };
    void load();
    const poll = window.setInterval(() => void load(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [opts.enabled, opts.agentId, opts.workspaceId, opts.projectId]);

  const pending = run ? pendingFromRun(run) : null;
  if (!opts.enabled || !opts.agentId || !run || !pending) return null;

  const previewBody =
    (typeof pending.preview?.body === "string" && pending.preview.body) ||
    (typeof pending.arguments?.body === "string" && pending.arguments.body) ||
    "";

  const onDecide = async (decision: "approve" | "reject") => {
    if (busy || !opts.agentId) return;
    setBusy(true);
    setError(null);
    try {
      await approveAgentRunClient({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        agentId: opts.agentId,
        runId: run.id,
        decision,
      });
      notifyAgentRuntimeRefresh({
        projectId: opts.projectId,
        agentId: opts.agentId,
        pending: decision === "approve",
      });
      setRun(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update approval.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
        <p className="text-[13px] font-medium text-foreground">
          Approval needed · {pending.toolId}
        </p>
        {pending.message ? (
          <p className="text-[12.5px] text-muted-foreground">{pending.message}</p>
        ) : null}
        {previewBody ? (
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-[10px] bg-muted/60 px-3 py-2 text-[12px] text-foreground">
            {previewBody}
          </pre>
        ) : null}
        {error ? (
          <p className="text-[12px] text-destructive">{error}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDecide("approve")}
            className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[12.5px] font-medium text-background disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDecide("reject")}
            className="inline-flex h-9 items-center rounded-full border border-border bg-background px-4 text-[12.5px] font-medium text-foreground disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
