/**
 * Agent execution runtime — create run first, then AI + scoped tools.
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  appendAgentRunEvent,
  completeAgentRun,
  createAgentRun,
  getAgentRun,
  getLatestSuccessfulRun,
  getProjectAgent,
  loadAgentBundle,
  updateProjectAgent,
} from "@/lib/agents/server";
import { computeNextRunAt } from "@/lib/agents/schedule";
import type { AgentRun, ProjectAgentBundle } from "@/lib/agents/types";
import { isHighImpactTool } from "@/lib/agents/types";
import { runAgentServerLoop } from "@/lib/ai/runtime/agent-loop-server";
import { authorizeToolExposure } from "@/lib/connectors/authorization";
import { listActiveConnections } from "@/lib/connectors/connections";
import { getCanderTool } from "@/lib/ai/tools/cander-registry";

export type RunAgentInput = {
  agentId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  triggerType: "manual" | "schedule" | string;
  /** Optional user nudge for this run */
  message?: string;
  /** Reuse a run already created (e.g. Gmail poll). */
  existingRunId?: string;
  triggerPayload?: Record<string, unknown>;
  idempotencyKey?: string;
  /** When set, high-impact tools may run (post-approval). */
  approvedAction?: boolean;
};

export type RunAgentResult = {
  run: AgentRun;
  content: string;
  toolCount: number;
};

function extractDraftReply(content: string): string | null {
  const labeled = content.match(
    /DRAFT_REPLY\s*[:\-]?\s*([\s\S]+?)(?:\n#{1,3}\s|\n---|\s*$)/i,
  );
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 8000);
  const fence = content.match(/```(?:email|reply|draft)?\n([\s\S]+?)```/i);
  if (fence?.[1]?.trim()) return fence[1].trim().slice(0, 8000);
  return null;
}

function buildRuntimePrompt(opts: {
  bundle: ProjectAgentBundle;
  previousSuccessfulAt: string | null;
  triggerType: string;
  nowIso: string;
}): string {
  const { bundle, previousSuccessfulAt, triggerType, nowIso } = opts;
  const instructions = bundle.agent.instructions?.trim();
  const skillBlocks = bundle.skills
    .map((s) => {
      const name = s.skill?.name ?? s.skillLabel;
      const md = s.skill?.markdown ?? "";
      return `## ${name}\n${md}`;
    })
    .join("\n\n");

  const knowledge =
    bundle.knowledge.length > 0
      ? bundle.knowledge
          .map((k) => `- ${k.sourceLabel} (${k.sourceKind}:${k.sourceId})`)
          .join("\n")
      : "None attached.";

  const approvalLines = bundle.tools
    .filter((t) => t.enabled)
    .map(
      (t) =>
        `- ${t.toolId} on ${t.connectionId}: approval=${t.approvalMode}`,
    )
    .join("\n");

  return [
    `# Agent`,
    `You are running as the agent: ${bundle.agent.name}.`,
    bundle.agent.description ? `Description: ${bundle.agent.description}` : "",
    ``,
    `# Instructions`,
    instructions || "(No instructions yet.)",
    ``,
    `# Skills`,
    skillBlocks || "(No additional skills.)",
    ``,
    `# Knowledge`,
    knowledge,
    ``,
    `# Tool approval policy`,
    approvalLines || "(No tools granted.)",
    `High-impact tools (send/reply/delete/etc.) are blocked until the user approves, unless approval_mode is auto.`,
    `If you draft a reply, label it clearly with DRAFT_REPLY: and do not send.`,
    ``,
    `# Run Context`,
    `Trigger: ${triggerType}`,
    `Triggered at: ${nowIso}`,
    previousSuccessfulAt
      ? `Previous successful run: ${previousSuccessfulAt}`
      : `Previous successful run: none`,
    ``,
    `# Available Tools`,
    `You may only use the tools provided to you for this run.`,
    `Do not claim actions you did not perform via tools.`,
    `When finished, summarize what you did (and what you skipped) clearly.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/** Intersect agent tool grants with live connection authz + approval mode. */
export async function resolveAgentAllowedToolIds(opts: {
  bundle: ProjectAgentBundle;
  workspaceId: string;
  profileId: string;
  approvedAction?: boolean;
}): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const connections = await listActiveConnections({
    client: admin,
    workspaceId: opts.workspaceId,
    profileId: opts.profileId,
  });
  if (!connections.ok) return [];

  const byConnection = new Map(
    connections.connections.map((c) => [c.connectionId, c]),
  );
  const enabledConnectors = new Set(
    opts.bundle.connectors
      .filter((c) => c.enabled)
      .map((c) => c.connectionId),
  );

  const allowed: string[] = [];
  for (const t of opts.bundle.tools) {
    if (!t.enabled) continue;
    if (!enabledConnectors.has(t.connectionId)) continue;
    const conn = byConnection.get(t.connectionId);
    if (!conn) continue;
    const tool = getCanderTool(t.toolId);
    if (!tool) continue;
    const authz = authorizeToolExposure(t.toolId, {
      workspaceId: opts.workspaceId,
      profileId: opts.profileId,
      connection: conn,
    });
    if (!authz.ok) continue;

    // Conservative default: block high-impact unless auto or explicitly approved.
    if (
      (t.approvalMode === "require_approval" || isHighImpactTool(t.toolId)) &&
      t.approvalMode !== "auto" &&
      !opts.approvedAction
    ) {
      continue;
    }
    allowed.push(t.toolId);
  }
  return [...new Set(allowed)];
}

export async function runAgent(
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const bundle = await loadAgentBundle(
    input.agentId,
    input.workspaceId,
    input.projectId,
  );
  if (!bundle) throw new Error("Agent not found.");

  if (
    (input.triggerType === "schedule" ||
      input.triggerType === "gmail_new_message") &&
    bundle.agent.status !== "active"
  ) {
    throw new Error("Scheduled/event runs require an active agent.");
  }
  if (
    input.triggerType === "manual" &&
    bundle.agent.status !== "active" &&
    bundle.agent.status !== "draft"
  ) {
    throw new Error("Paused agents cannot run. Set status to Active.");
  }

  const run =
    input.existingRunId
      ? (await getAgentRun(input.existingRunId, input.workspaceId)) ??
        (await createAgentRun({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          agentId: input.agentId,
          triggerType: input.triggerType,
          userId: input.profileId,
          idempotencyKey: input.idempotencyKey,
          triggerPayload: input.triggerPayload,
        }))
      : await createAgentRun({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          agentId: input.agentId,
          triggerType: input.triggerType,
          userId: input.profileId,
          idempotencyKey: input.idempotencyKey,
          triggerPayload: input.triggerPayload,
        });

  // Idempotent hit — do not re-execute finished / waiting runs.
  if (run.status !== "running") {
    return {
      run,
      content: run.summary || `Run already ${run.status}.`,
      toolCount: 0,
    };
  }

  try {
    await appendAgentRunEvent({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      runId: run.id,
      eventType: "work_started",
      payload: { triggerType: input.triggerType },
    });

    const previous = await getLatestSuccessfulRun(
      input.agentId,
      input.workspaceId,
    );
    const allowedToolIds = await resolveAgentAllowedToolIds({
      bundle,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      approvedAction: input.approvedAction,
    });

    const nowIso = new Date().toISOString();
    const systemExtra = buildRuntimePrompt({
      bundle,
      previousSuccessfulAt: previous?.completedAt ?? previous?.startedAt ?? null,
      triggerType: input.triggerType,
      nowIso,
    });

    const userMessage =
      input.message?.trim() ||
      `Execute your instructions now for this ${input.triggerType} run. Use tools as needed, then summarize.`;

    const client = createSupabaseAdminClient();

    const loop = await runAgentServerLoop({
      client,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      messages: [{ role: "user", content: userMessage }],
      allowedToolIds,
      systemExtra,
      agentRunId: run.id,
      aiChatId: `agent-run:${run.id}`,
      maxIterations: 8,
    });

    for (const tr of loop.toolResults) {
      await appendAgentRunEvent({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        runId: run.id,
        eventType: "tool_called",
        payload: {
          tool: tr.toolId,
          ok: tr.status === "success",
          outputPreview: String(
            tr.error?.message ??
              (typeof tr.data === "string"
                ? tr.data
                : JSON.stringify(tr.data ?? {})),
          ).slice(0, 500),
        },
      });
    }

    const summary =
      loop.content.trim().slice(0, 2000) ||
      (loop.toolResults.length
        ? `Completed with ${loop.toolResults.length} tool call(s).`
        : "Completed with no tool calls.");

    const draft = extractDraftReply(loop.content);
    const needsApproval =
      !input.approvedAction &&
      !loop.pause &&
      Boolean(draft) &&
      (input.triggerType === "gmail_new_message" || Boolean(draft));

    if (needsApproval && draft) {
      await appendAgentRunEvent({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        runId: run.id,
        eventType: "draft_created",
        payload: {
          draft,
          messageId: input.triggerPayload?.messageId ?? null,
          threadId: input.triggerPayload?.threadId ?? null,
        },
      });
      await appendAgentRunEvent({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        runId: run.id,
        eventType: "approval_needed",
        payload: { reason: "Send requires approval", draft },
      });
      const waiting = await completeAgentRun({
        runId: run.id,
        workspaceId: input.workspaceId,
        status: "approval_needed",
        summary,
      });

      // Keep schedules moving even when a draft is waiting on the user.
      if (
        input.triggerType === "schedule" &&
        bundle.agent.trigger.type === "schedule"
      ) {
        const next = computeNextRunAt(bundle.agent.trigger, new Date());
        await updateProjectAgent(
          input.agentId,
          input.workspaceId,
          input.projectId,
          {
            lastTriggeredAt: nowIso,
            nextRunAt: next ? next.toISOString() : null,
          },
        );
      }

      return {
        run: waiting,
        content: loop.content,
        toolCount: loop.toolResults.length,
      };
    }

    const completed = await completeAgentRun({
      runId: run.id,
      workspaceId: input.workspaceId,
      status: loop.pause ? "failed" : "completed",
      summary: loop.pause ? loop.pause.message : summary,
      error: loop.pause ? loop.pause.message : undefined,
    });

    await appendAgentRunEvent({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      runId: run.id,
      eventType: loop.pause ? "error" : "completed",
      payload: { summary: completed.summary },
    });

    if (
      input.triggerType === "schedule" &&
      bundle.agent.trigger.type === "schedule"
    ) {
      const next = computeNextRunAt(bundle.agent.trigger, new Date());
      await updateProjectAgent(
        input.agentId,
        input.workspaceId,
        input.projectId,
        {
          lastTriggeredAt: nowIso,
          nextRunAt: next ? next.toISOString() : null,
        },
      );
    } else if (
      input.triggerType === "manual" ||
      input.triggerType === "gmail_new_message"
    ) {
      await updateProjectAgent(
        input.agentId,
        input.workspaceId,
        input.projectId,
        { lastTriggeredAt: nowIso },
      );
    }

    return {
      run: completed,
      content: loop.content,
      toolCount: loop.toolResults.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed.";
    await appendAgentRunEvent({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      runId: run.id,
      eventType: "error",
      payload: { error: message },
    });
    const failed = await completeAgentRun({
      runId: run.id,
      workspaceId: input.workspaceId,
      status: "failed",
      error: message,
      summary: message,
    });
    return { run: failed, content: message, toolCount: 0 };
  }
}

/** Claim due scheduled agents for cron (atomic-ish via claim token). */
export async function claimDueScheduledAgents(limit = 10): Promise<
  Array<{
    agentId: string;
    workspaceId: string;
    projectId: string;
    createdBy: string;
    /** ISO next_run_at that was due — used for schedule idempotency slots. */
    dueAt: string;
  }>
> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const claimToken = `claim_${crypto.randomUUID().replace(/-/g, "")}`;

  const { data: due } = await admin
    .from("project_agents")
    .select(
      "id, workspace_id, project_id, created_by, trigger, schedule_claimed_at, next_run_at",
    )
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(limit);

  const claimed: Array<{
    agentId: string;
    workspaceId: string;
    projectId: string;
    createdBy: string;
    dueAt: string;
  }> = [];

  for (const row of due ?? []) {
    const trigger = row.trigger as { type?: string } | null;
    if (trigger?.type !== "schedule") continue;
    const claimedAt = row.schedule_claimed_at
      ? new Date(String(row.schedule_claimed_at)).getTime()
      : 0;
    if (claimedAt && Date.now() - claimedAt < 10 * 60 * 1000) continue;

    const dueAt = String(row.next_run_at ?? now);
    const { data: updated } = await admin
      .from("project_agents")
      .update({
        schedule_claim_token: claimToken,
        schedule_claimed_at: now,
      })
      .eq("id", row.id)
      .eq("status", "active")
      .lte("next_run_at", now)
      .select("id")
      .maybeSingle();

    if (!updated) continue;
    claimed.push({
      agentId: String(row.id),
      workspaceId: String(row.workspace_id),
      projectId: String(row.project_id),
      createdBy: String(row.created_by),
      dueAt,
    });
  }

  return claimed;
}

export async function clearScheduleClaim(agentId: string, workspaceId: string) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("project_agents")
    .update({
      schedule_claim_token: null,
      schedule_claimed_at: null,
    })
    .eq("id", agentId)
    .eq("workspace_id", workspaceId);
}

export async function getAgentForAuth(
  agentId: string,
  workspaceId: string,
  projectId: string,
) {
  return getProjectAgent(agentId, workspaceId, projectId);
}
