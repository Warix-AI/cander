/**
 * Agent execution runtime — create run first, then AI + scoped tools.
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  completeAgentRun,
  createAgentRun,
  getLatestSuccessfulRun,
  getProjectAgent,
  loadAgentBundle,
  updateProjectAgent,
} from "@/lib/agents/server";
import { computeNextRunAt } from "@/lib/agents/schedule";
import type { AgentRun, ProjectAgentBundle } from "@/lib/agents/types";
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
};

export type RunAgentResult = {
  run: AgentRun;
  content: string;
  toolCount: number;
};

function buildRuntimePrompt(opts: {
  bundle: ProjectAgentBundle;
  previousSuccessfulAt: string | null;
  triggerType: string;
  nowIso: string;
}): string {
  const { bundle, previousSuccessfulAt, triggerType, nowIso } = opts;
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

  return [
    `# Agent`,
    `You are running as the agent: ${bundle.agent.name}.`,
    bundle.agent.description ? `Description: ${bundle.agent.description}` : "",
    ``,
    `# Your Skills`,
    skillBlocks || "(No skills attached — explain that you need a skill.)",
    ``,
    `# Knowledge`,
    knowledge,
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

/** Intersect agent tool grants with live connection authz. */
export async function resolveAgentAllowedToolIds(opts: {
  bundle: ProjectAgentBundle;
  workspaceId: string;
  profileId: string;
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
    if (authz.ok) allowed.push(t.toolId);
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

  if (input.triggerType === "schedule" && bundle.agent.status !== "active") {
    throw new Error("Scheduled runs require an active agent.");
  }
  if (
    input.triggerType === "manual" &&
    bundle.agent.status !== "active" &&
    bundle.agent.status !== "draft"
  ) {
    throw new Error("Paused agents cannot run. Set status to Active.");
  }

  // 1) Create run BEFORE the model loop
  const run = await createAgentRun({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    agentId: input.agentId,
    triggerType: input.triggerType,
    userId: input.profileId,
  });

  try {
    const previous = await getLatestSuccessfulRun(
      input.agentId,
      input.workspaceId,
    );
    const allowedToolIds = await resolveAgentAllowedToolIds({
      bundle,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
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
      `Execute your skills now for this ${input.triggerType} run. Use tools as needed, then summarize.`;

    // Prefer admin client for unattended + consistent authz; tool executor
    // still validates profile/workspace/connection.
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

    const summary =
      loop.content.trim().slice(0, 2000) ||
      (loop.toolResults.length
        ? `Completed with ${loop.toolResults.length} tool call(s).`
        : "Completed with no tool calls.");

    const completed = await completeAgentRun({
      runId: run.id,
      workspaceId: input.workspaceId,
      status: loop.pause ? "failed" : "completed",
      summary: loop.pause ? loop.pause.message : summary,
      error: loop.pause ? loop.pause.message : undefined,
    });

    // Advance schedule after a scheduled trigger
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
    } else if (input.triggerType === "manual") {
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
  }>
> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const claimToken = `claim_${crypto.randomUUID().replace(/-/g, "")}`;

  const { data: due } = await admin
    .from("project_agents")
    .select("id, workspace_id, project_id, created_by, trigger, schedule_claimed_at")
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
  }> = [];

  for (const row of due ?? []) {
    const trigger = row.trigger as { type?: string } | null;
    if (trigger?.type !== "schedule") continue;
    // Skip if claimed recently (< 10 min) without clear
    const claimedAt = row.schedule_claimed_at
      ? new Date(String(row.schedule_claimed_at)).getTime()
      : 0;
    if (claimedAt && Date.now() - claimedAt < 10 * 60 * 1000) continue;

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
