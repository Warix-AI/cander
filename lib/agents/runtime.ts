/**
 * Agent runtime — Agent asks Cander AI; Cander uses normal tools/connectors.
 * Server-only.
 */

import OpenAI from "openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  appendAgentMessage,
  completeAgentRun,
  createAgentRun,
  getAgentRun,
  getProjectAgent,
  listAgentMessages,
  loadAgentBundle,
  updateProjectAgent,
} from "@/lib/agents/server";
import { computeNextRunAt } from "@/lib/agents/schedule";
import type {
  AgentConversationMessage,
  AgentRun,
  ProjectAgent,
} from "@/lib/agents/types";
import { errorMessageFromUnknown } from "@/lib/agents/types";
import { runAgentServerLoop } from "@/lib/ai/runtime/agent-loop-server";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";

const MAX_AGENT_ROUNDS = 6;

export type RunAgentInput = {
  agentId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  triggerType: "manual" | "schedule" | string;
  /** Optional nudge injected as the first Agent utterance this wake. */
  message?: string;
  existingRunId?: string;
  idempotencyKey?: string;
  triggerPayload?: Record<string, unknown>;
};

export type RunAgentResult = {
  run: AgentRun;
  content: string;
  toolCount: number;
};

type AgentPlan = {
  message: string;
  done: boolean;
};

function historyForPrompt(messages: AgentConversationMessage[]): string {
  if (!messages.length) return "(No prior conversation.)";
  return messages
    .slice(-40)
    .map((m) => {
      const who =
        m.role === "agent" ? "Agent" : m.role === "cander" ? "Cander" : "System";
      return `${who}: ${m.content}`;
    })
    .join("\n\n");
}

async function planNextAgentMessage(opts: {
  agent: ProjectAgent;
  history: AgentConversationMessage[];
  wakeNudge?: string;
  round: number;
}): Promise<AgentPlan> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      message:
        opts.wakeNudge?.trim() ||
        "Please help me follow my agent instructions using my connected apps.",
      done: false,
    };
  }

  const openai = new OpenAI({ apiKey });
  const model = resolveOpenAIModel();
  const system = `You are the automated agent named "${opts.agent.name}".
You act as an extension of the user. You do NOT call tools yourself.
You talk to Cander AI in first person (as the user) and ask Cander to do the work
using the user's existing connectors (Gmail, Calendar, etc.).

Your standing instructions (Markdown):
---
${opts.agent.instructions || "(none)"}
---

Decide the next message to send to Cander, or finish this wake-up.
Return ONLY JSON: {"message":"string","done":boolean}
- If more work is needed, done=false and message is what you ask Cander.
- If the job for this wake is complete, blocked, or needs something unavailable, done=true.
- Keep messages short and concrete.
- Never claim you already sent email or ran tools — only Cander can do that.`;

  const user = [
    `Wake round: ${opts.round + 1} of ${MAX_AGENT_ROUNDS}`,
    opts.wakeNudge?.trim()
      ? `Wake nudge from scheduler/UI: ${opts.wakeNudge.trim()}`
      : "",
    `Conversation so far:\n${historyForPrompt(opts.history)}`,
    opts.round === 0
      ? "This is the start of a wake-up. Ask Cander for the first useful step."
      : "Continue or finish based on Cander's last reply.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await openai.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text =
      typeof response.output_text === "string" ? response.output_text.trim() : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        message?: unknown;
        done?: unknown;
      };
      return {
        message: String(parsed.message ?? "").trim(),
        done: Boolean(parsed.done),
      };
    }
    return { message: text, done: !text };
  } catch {
    if (opts.round === 0) {
      return {
        message:
          opts.wakeNudge?.trim() ||
          "Please help me carry out my agent instructions using my connected apps. Start by checking anything that needs attention per the instructions.",
        done: false,
      };
    }
    return { message: "", done: true };
  }
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
    input.triggerType === "schedule" &&
    bundle.agent.status !== "active"
  ) {
    throw new Error("Scheduled runs require an active agent.");
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

  if (run.status !== "running") {
    return {
      run,
      content: run.summary || `Run already ${run.status}.`,
      toolCount: 0,
    };
  }

  const nowIso = new Date().toISOString();
  let toolCount = 0;
  let lastCander = "";

  try {
    await appendAgentMessage({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      runId: run.id,
      role: "system",
      content: `Wake · ${input.triggerType} · ${nowIso}`,
    });

    const history = await listAgentMessages({
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      limit: 80,
    });
    // Exclude this wake's system marker from planning context noise optionally —
    // keep full history including prior wakes.
    const workingHistory = [...history];
    const client = createSupabaseAdminClient();

    for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
      const plan = await planNextAgentMessage({
        agent: bundle.agent,
        history: workingHistory,
        wakeNudge: round === 0 ? input.message : undefined,
        round,
      });

      if (plan.done && !plan.message.trim()) break;

      const agentText =
        plan.message.trim() ||
        (round === 0
          ? "Please help with my standing agent instructions."
          : "");
      if (!agentText) break;

      const agentMsg = await appendAgentMessage({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        runId: run.id,
        role: "agent",
        content: agentText,
      });
      workingHistory.push(agentMsg);

      const loopMessages = workingHistory
        .filter((m) => m.role === "agent" || m.role === "cander")
        .slice(-30)
        .map((m) => ({
          role: (m.role === "agent" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.content,
        }));

      const loop = await runAgentServerLoop({
        client,
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        messages: loopMessages,
        // No allowedToolIds — Cander uses the user's normal connectors/tools.
        systemExtra: [
          `An automated agent named "${bundle.agent.name}" is speaking as the user.`,
          `Follow normal Cander safety and approval rules. Do not grant the agent extra permissions.`,
          `Agent standing instructions (for your awareness):`,
          bundle.agent.instructions.slice(0, 4000),
        ].join("\n"),
        agentRunId: run.id,
        aiChatId: `agent-runtime:${input.agentId}`,
        maxIterations: 8,
      });

      toolCount += loop.toolResults.length;
      lastCander =
        loop.content.trim() ||
        (loop.pause
          ? loop.pause.message
          : "Cander finished without a text reply.");

      const canderMsg = await appendAgentMessage({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        runId: run.id,
        role: "cander",
        content: lastCander,
      });
      workingHistory.push(canderMsg);

      if (loop.pause) {
        // Approval / skill gate — stop this wake; user resolves in normal Cander flows.
        break;
      }
      if (plan.done) break;
    }

    const completed = await completeAgentRun({
      runId: run.id,
      workspaceId: input.workspaceId,
      status: "completed",
      summary: lastCander.slice(0, 2000) || "Wake completed.",
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
    } else {
      await updateProjectAgent(
        input.agentId,
        input.workspaceId,
        input.projectId,
        { lastTriggeredAt: nowIso },
      );
    }

    return {
      run: completed,
      content: lastCander,
      toolCount,
    };
  } catch (err) {
    const message = errorMessageFromUnknown(err);
    try {
      await appendAgentMessage({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        runId: run.id,
        role: "system",
        content: `Error: ${message}`,
      });
    } catch {
      /* ignore */
    }
    const failed = await completeAgentRun({
      runId: run.id,
      workspaceId: input.workspaceId,
      status: "failed",
      error: message,
      summary: message,
    });
    return { run: failed, content: message, toolCount };
  }
}

/** Claim due scheduled agents for cron (atomic-ish via claim token). */
export async function claimDueScheduledAgents(limit = 10): Promise<
  Array<{
    agentId: string;
    workspaceId: string;
    projectId: string;
    createdBy: string;
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
    if (claimedAt && Date.now() - claimedAt < 45 * 1000) continue;

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
