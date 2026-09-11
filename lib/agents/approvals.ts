/**
 * Agent run approval actions — approve / reject / revise pending drafts.
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeConnectorTool } from "@/lib/connectors/tool-execute";
import {
  appendAgentRunEvent,
  completeAgentRun,
  getAgentRun,
  listAgentRunEvents,
  loadAgentBundle,
  updateProjectAgent,
} from "@/lib/agents/server";
import type { AgentRun, AgentRunEvent } from "@/lib/agents/types";

function latestDraft(events: AgentRunEvent[]): {
  draft: string;
  messageId: string | null;
  threadId: string | null;
} | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (
      ev.eventType === "draft_created" ||
      ev.eventType === "revised" ||
      ev.eventType === "approval_needed"
    ) {
      const draft = String(ev.payload.draft ?? "").trim();
      if (!draft) continue;
      return {
        draft,
        messageId:
          ev.payload.messageId != null
            ? String(ev.payload.messageId)
            : null,
        threadId:
          ev.payload.threadId != null ? String(ev.payload.threadId) : null,
      };
    }
  }
  return null;
}

function resolveGmailConnectionId(
  bundle: NonNullable<Awaited<ReturnType<typeof loadAgentBundle>>>,
): string | null {
  const trigger = bundle.agent.trigger;
  if (trigger.type === "gmail_new_message") return trigger.connectionId;
  const gmailTool = bundle.tools.find(
    (t) =>
      t.enabled &&
      (t.toolId === "gmail.reply" ||
        t.toolId === "gmail.send" ||
        t.toolId.startsWith("gmail.")),
  );
  return gmailTool?.connectionId ?? null;
}

export async function approveAgentRun(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  runId: string;
  profileId: string;
  draftOverride?: string;
}): Promise<{ run: AgentRun; sent: boolean; error?: string }> {
  const run = await getAgentRun(opts.runId, opts.workspaceId);
  if (!run || run.agentId !== opts.agentId) {
    throw new Error("Run not found.");
  }
  if (run.status !== "approval_needed" && run.status !== "running") {
    throw new Error("Run is not waiting for approval.");
  }

  const bundle = await loadAgentBundle(
    opts.agentId,
    opts.workspaceId,
    opts.projectId,
  );
  if (!bundle) throw new Error("Agent not found.");

  const events = await listAgentRunEvents({
    runId: opts.runId,
    workspaceId: opts.workspaceId,
  });
  const pending = latestDraft(events);
  const draft = (opts.draftOverride ?? pending?.draft ?? "").trim();
  if (!draft) throw new Error("No draft to send.");

  const connectionId = resolveGmailConnectionId(bundle);
  if (!connectionId) {
    throw new Error("No Gmail connection granted to this agent.");
  }

  const threadId =
    pending?.threadId ||
    (run.triggerPayload.threadId != null
      ? String(run.triggerPayload.threadId)
      : "");
  const messageId =
    pending?.messageId ||
    (run.triggerPayload.messageId != null
      ? String(run.triggerPayload.messageId)
      : "");

  const admin = createSupabaseAdminClient();
  let sendResult: { ok: true; output: string } | { ok: false; error: string };

  if (threadId) {
    sendResult = await executeConnectorTool({
      client: admin,
      workspaceId: opts.workspaceId,
      profileId: opts.profileId,
      tool: "gmail.reply",
      connectionId,
      agentRunId: opts.runId,
      confirmed: true,
      arguments: {
        threadId,
        body: draft,
        ...(messageId ? { messageId } : {}),
      },
    });
  } else {
    // Fallback: send as new message if we somehow lack a thread.
    const to = String(run.triggerPayload.from ?? "").trim();
    sendResult = await executeConnectorTool({
      client: admin,
      workspaceId: opts.workspaceId,
      profileId: opts.profileId,
      tool: "gmail.send",
      connectionId,
      agentRunId: opts.runId,
      confirmed: true,
      arguments: {
        to: to || "me",
        subject: `Re: ${String(run.triggerPayload.subject ?? "your message")}`,
        body: draft,
      },
    });
  }

  if (!sendResult.ok) {
    await appendAgentRunEvent({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      agentId: opts.agentId,
      runId: opts.runId,
      eventType: "error",
      payload: { error: sendResult.error, phase: "approve_send" },
    });
    return {
      run,
      sent: false,
      error: sendResult.error,
    };
  }

  await appendAgentRunEvent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    runId: opts.runId,
    eventType: "approved",
    payload: { draft, threadId: threadId || null, messageId: messageId || null },
  });
  await appendAgentRunEvent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    runId: opts.runId,
    eventType: "completed",
    payload: { sent: true },
  });

  const completed = await completeAgentRun({
    runId: opts.runId,
    workspaceId: opts.workspaceId,
    status: "completed",
    summary: `Approved and sent reply.`,
  });

  return { run: completed, sent: true };
}

export async function rejectAgentRun(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  runId: string;
  reason?: string;
}): Promise<AgentRun> {
  const run = await getAgentRun(opts.runId, opts.workspaceId);
  if (!run || run.agentId !== opts.agentId) {
    throw new Error("Run not found.");
  }
  if (run.status !== "approval_needed") {
    throw new Error("Run is not waiting for approval.");
  }

  await appendAgentRunEvent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    runId: opts.runId,
    eventType: "rejected",
    payload: { reason: opts.reason ?? "Rejected by user" },
  });

  return completeAgentRun({
    runId: opts.runId,
    workspaceId: opts.workspaceId,
    status: "cancelled",
    summary: opts.reason?.trim() || "Draft rejected.",
  });
}

export async function reviseAgentRun(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  runId: string;
  draft: string;
  note?: string;
}): Promise<{ run: AgentRun; draft: string }> {
  const run = await getAgentRun(opts.runId, opts.workspaceId);
  if (!run || run.agentId !== opts.agentId) {
    throw new Error("Run not found.");
  }
  if (run.status !== "approval_needed") {
    throw new Error("Run is not waiting for approval.");
  }
  const draft = opts.draft.trim();
  if (!draft) throw new Error("Revised draft is empty.");

  const events = await listAgentRunEvents({
    runId: opts.runId,
    workspaceId: opts.workspaceId,
  });
  const pending = latestDraft(events);

  await appendAgentRunEvent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    runId: opts.runId,
    eventType: "revised",
    payload: {
      draft,
      note: opts.note ?? null,
      messageId: pending?.messageId ?? run.triggerPayload.messageId ?? null,
      threadId: pending?.threadId ?? run.triggerPayload.threadId ?? null,
    },
  });
  await appendAgentRunEvent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    runId: opts.runId,
    eventType: "approval_needed",
    payload: { reason: "Revised draft awaiting approval", draft },
  });

  const updated = await completeAgentRun({
    runId: opts.runId,
    workspaceId: opts.workspaceId,
    status: "approval_needed",
    summary: "Draft revised — still needs approval.",
  });

  return { run: updated, draft };
}

/** Map Activity chat-ish commands to config / approval actions. */
export async function handleActivityUserMessage(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  profileId: string;
  message: string;
}): Promise<{
  handled: boolean;
  action?: string;
  run?: AgentRun;
  error?: string;
}> {
  const text = opts.message.trim();
  if (!text) return { handled: false };

  const lower = text.toLowerCase();

  if (
    /\b(pause|stop)\b/.test(lower) &&
    /\b(buddy|agent)\b/.test(lower)
  ) {
    await updateProjectAgent(opts.agentId, opts.workspaceId, opts.projectId, {
      status: "paused",
    });
    return { handled: true, action: "paused" };
  }

  const pendingRuns = await listPendingApprovalRuns(
    opts.agentId,
    opts.workspaceId,
  );
  const pending = pendingRuns[0];
  if (!pending) {
    return { handled: false };
  }

  await appendAgentRunEvent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    runId: pending.id,
    eventType: "user_message",
    payload: { text },
  });

  if (
    /^(send|approve|yes|ship it|send it)\b/i.test(text) ||
    /\b(send it|approve it|looks good)\b/i.test(lower)
  ) {
    const result = await approveAgentRun({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      agentId: opts.agentId,
      runId: pending.id,
      profileId: opts.profileId,
    });
    return {
      handled: true,
      action: result.sent ? "approved" : "approve_failed",
      run: result.run,
      error: result.error,
    };
  }

  if (/^(reject|cancel|discard|no)\b/i.test(text)) {
    const run = await rejectAgentRun({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      agentId: opts.agentId,
      runId: pending.id,
      reason: text,
    });
    return { handled: true, action: "rejected", run };
  }

  // Treat other messages as revise notes — keep draft unless the user pasted a full rewrite.
  const events = await listAgentRunEvents({
    runId: pending.id,
    workspaceId: opts.workspaceId,
  });
  const current = latestDraft(events);
  if (!current) return { handled: false };

  const looksLikeFullDraft =
    text.length > 120 &&
    !/^(make|shorten|longer|more|less|add|remove|please|can you)\b/i.test(text);
  const nextDraft = looksLikeFullDraft ? text : current.draft;

  const revised = await reviseAgentRun({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    runId: pending.id,
    draft: nextDraft,
    note: text,
  });
  return { handled: true, action: "revised", run: revised.run };
}

async function listPendingApprovalRuns(
  agentId: string,
  workspaceId: string,
): Promise<AgentRun[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("agent_runs")
    .select("*")
    .eq("agent_id", agentId)
    .eq("workspace_id", workspaceId)
    .eq("status", "approval_needed")
    .order("started_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    agentId: String(row.agent_id),
    triggerType: String(row.trigger_type ?? "manual"),
    status: "approval_needed" as const,
    startedAt: String(row.started_at ?? ""),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    summary: row.summary != null ? String(row.summary) : null,
    error: row.error != null ? String(row.error) : null,
    idempotencyKey:
      row.idempotency_key != null ? String(row.idempotency_key) : null,
    triggerPayload:
      row.trigger_payload && typeof row.trigger_payload === "object"
        ? (row.trigger_payload as Record<string, unknown>)
        : {},
  }));
}
