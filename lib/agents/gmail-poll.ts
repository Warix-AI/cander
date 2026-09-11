/**
 * Gmail new-message polling for Agents V1.
 * Server-only — uses existing connector tool execution.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeConnectorTool } from "@/lib/connectors/tool-execute";
import {
  appendAgentRunEvent,
  createAgentRun,
  completeAgentRun,
  updateProjectAgent,
  loadAgentBundle,
} from "@/lib/agents/server";
import { runAgent } from "@/lib/agents/runtime";
import type { AgentTrigger, ProjectAgent } from "@/lib/agents/types";
import { parseAgentTrigger } from "@/lib/agents/types";

function parseToolJson(output: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function buildGmailQuery(
  filter: Extract<AgentTrigger, { type: "gmail_new_message" }>["filter"],
  lastCheckedAt?: string,
): string {
  const parts: string[] = ["in:inbox"];
  if (filter.fromContains?.trim()) {
    parts.push(`from:${filter.fromContains.trim()}`);
  }
  if (filter.query?.trim()) {
    parts.push(filter.query.trim());
  }
  if (lastCheckedAt) {
    const d = new Date(lastCheckedAt);
    if (!Number.isNaN(d.getTime())) {
      // Gmail newer_than uses relative days; use after:YYYY/MM/DD as fallback.
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      parts.push(`after:${y}/${m}/${day}`);
    }
  } else {
    parts.push("newer_than:2d");
  }
  return parts.join(" ");
}

export async function listActiveGmailTriggerAgents(limit = 8): Promise<
  Array<{
    agent: ProjectAgent;
    trigger: Extract<AgentTrigger, { type: "gmail_new_message" }>;
    createdBy: string;
  }>
> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_agents")
    .select("*")
    .eq("status", "active")
    .limit(80);

  const out: Array<{
    agent: ProjectAgent;
    trigger: Extract<AgentTrigger, { type: "gmail_new_message" }>;
    createdBy: string;
  }> = [];

  for (const row of data ?? []) {
    const trigger = parseAgentTrigger(row.trigger);
    if (trigger.type !== "gmail_new_message") continue;
    out.push({
      agent: {
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        projectId: String(row.project_id),
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        instructions: String(row.instructions ?? ""),
        enabled: true,
        status: "active",
        trigger,
        nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
        lastTriggeredAt: row.last_triggered_at
          ? String(row.last_triggered_at)
          : null,
        icon: row.icon != null ? String(row.icon) : null,
        color: row.color != null ? String(row.color) : null,
        pinned: Boolean(row.pinned),
        sortOrder: Number(row.sort_order ?? 0),
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
      },
      trigger,
      createdBy: String(row.created_by),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Poll one Gmail-trigger agent; create idempotent runs for new messages.
 */
export async function pollGmailTriggerAgent(opts: {
  agentId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
}): Promise<{ createdRuns: string[]; checked: number }> {
  const bundle = await loadAgentBundle(
    opts.agentId,
    opts.workspaceId,
    opts.projectId,
  );
  if (!bundle || bundle.agent.status !== "active") {
    return { createdRuns: [], checked: 0 };
  }
  const trigger = bundle.agent.trigger;
  if (trigger.type !== "gmail_new_message") {
    return { createdRuns: [], checked: 0 };
  }

  const admin = createSupabaseAdminClient();
  const query = buildGmailQuery(trigger.filter, trigger.cursor?.lastCheckedAt);
  const result = await executeConnectorTool({
    client: admin,
    workspaceId: opts.workspaceId,
    profileId: opts.profileId,
    tool: "gmail.search",
    arguments: { query, maxResults: 10 },
    connectionId: trigger.connectionId,
  });

  const nowIso = new Date().toISOString();
  if (!result.ok) {
    // Advance cursor anyway so we don't spin on a broken connection forever.
    await updateProjectAgent(opts.agentId, opts.workspaceId, opts.projectId, {
      trigger: {
        ...trigger,
        cursor: { lastCheckedAt: nowIso },
      },
      lastTriggeredAt: nowIso,
    });
    return { createdRuns: [], checked: 0 };
  }

  const payload = parseToolJson(result.output);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const createdRuns: string[] = [];

  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const msg = item as Record<string, unknown>;
    const messageId = String(msg.id ?? msg.messageId ?? msg.message_id ?? "");
    if (!messageId) continue;
    const idempotencyKey = `gmail:${opts.agentId}:${messageId}`;

    const run = await createAgentRun({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      agentId: opts.agentId,
      triggerType: "gmail_new_message",
      userId: opts.profileId,
      idempotencyKey,
      triggerPayload: {
        messageId,
        threadId: msg.threadId ?? msg.thread_id ?? null,
        from: msg.from ?? null,
        subject: msg.subject ?? null,
        snippet: msg.snippet ?? null,
      },
    });

    // Skip if this was an existing completed/approval run (idempotent hit).
    if (run.status !== "running") continue;

    await appendAgentRunEvent({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      agentId: opts.agentId,
      runId: run.id,
      eventType: "trigger_received",
      payload: {
        messageId,
        from: msg.from ?? null,
        subject: msg.subject ?? null,
      },
    });

    try {
      const executed = await runAgent({
        agentId: opts.agentId,
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        profileId: opts.profileId,
        triggerType: "gmail_new_message",
        message: [
          `A new Gmail message matched your filter.`,
          `Message ID: ${messageId}`,
          `From: ${String(msg.from ?? "")}`,
          `Subject: ${String(msg.subject ?? "")}`,
          `Snippet: ${String(msg.snippet ?? "")}`,
          ``,
          `Read the message if needed, draft a reply, and STOP before sending.`,
          `Put the draft reply body in your summary clearly labeled DRAFT_REPLY.`,
          `Do not call gmail.send or gmail.reply unless send is approved for automatic execution.`,
        ].join("\n"),
        existingRunId: run.id,
        triggerPayload: {
          messageId,
          threadId: msg.threadId ?? msg.thread_id ?? null,
        },
      });
      createdRuns.push(executed.run.id);
    } catch (err) {
      await completeAgentRun({
        runId: run.id,
        workspaceId: opts.workspaceId,
        status: "failed",
        error: err instanceof Error ? err.message : "Gmail agent run failed.",
      });
    }
  }

  await updateProjectAgent(opts.agentId, opts.workspaceId, opts.projectId, {
    trigger: {
      ...trigger,
      cursor: { lastCheckedAt: nowIso },
    },
    lastTriggeredAt: nowIso,
  });

  return { createdRuns, checked: messages.length };
}
