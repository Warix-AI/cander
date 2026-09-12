/**
 * Agent runtime — Agent decides; Cander executes connectors/tools.
 * Multi-step Agent ↔ Cander delegation loop. Server-only.
 *
 * Model: Instructions + Schedule/Trigger + Scope + Activity.
 */

import OpenAI from "openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  appendAgentMessage,
  completeAgentRun,
  createAgentRun,
  getAgentRun,
  getProjectAgent,
  listAgentConnectorScopes,
  listAgentMessages,
  loadAgentBundle,
  updateProjectAgent,
} from "@/lib/agents/server";
import { computeNextRunAt } from "@/lib/agents/schedule";
import type {
  AgentActivityOutcome,
  AgentConversationMessage,
  AgentRun,
  AgentRunStatus,
  AgentScopeConnection,
  ProjectAgent,
} from "@/lib/agents/types";
import {
  errorMessageFromUnknown,
  fallbackRunOutcomeSummary,
} from "@/lib/agents/types";
import { runAgentServerLoop } from "@/lib/ai/runtime/agent-loop-server";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";

const MAX_AGENT_ROUNDS = 6;

/** Private ai_chats row so tool events / loop state can FK to a real chat id. */
async function ensureAgentRuntimeAiChat(opts: {
  client: ReturnType<typeof createSupabaseAdminClient>;
  chatId: string;
  ownerId: string;
  workspaceId: string;
  title: string;
}) {
  const { error } = await opts.client.from("ai_chats").upsert(
    {
      id: opts.chatId,
      owner_id: opts.ownerId,
      workspace_id: opts.workspaceId,
      title: opts.title.slice(0, 80) || "Agent runtime",
      conversation_state: {},
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("[agents] ensure runtime ai_chat skipped:", error.message);
  }
}

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

function formatScopeForPrompt(scope: AgentScopeConnection[]): string {
  if (!scope.length) {
    return "Scope: all of the user's connected apps (no restriction).";
  }
  return `Scope (only these Cander resources may be used): ${scope
    .map((s) => s.label || `${s.connectorId} (${s.connectionId})`)
    .join("; ")}.`;
}

async function planNextAgentMessage(opts: {
  agent: ProjectAgent;
  history: AgentConversationMessage[];
  wakeNudge?: string;
  round: number;
  scope: AgentScopeConnection[];
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
You are a DELEGATOR only. You never call Gmail, Calendar, CRM, Stripe, or any other app yourself.
You talk to Cander AI in first person (as the user) and ask Cander to do each step.
Cander owns intelligence and connector/tool execution.

${formatScopeForPrompt(opts.scope)}

Your standing instructions (Markdown):
---
${opts.agent.instructions || "(none)"}
---

Rules:
- Decide the next single message to send to Cander, or finish this wake-up.
- Never claim you already checked email, booked something, or sent a message — only Cander can do that.
- After Cander replies, evaluate against your instructions and either ask the next concrete step or finish.
- Prefer short, specific asks (one step at a time).
- If blocked, waiting on the user, or nothing useful remains, set done=true.
- Return ONLY JSON: {"message":"string","done":boolean}
- If more work is needed, done=false and message is what you ask Cander.
- If this wake is complete, blocked, or needs something unavailable, done=true (message may be empty).`;

  const user = [
    opts.round === 0
      ? "Wake-up: start or continue work per your instructions."
      : `Delegation round ${opts.round + 1}. Continue or finish.`,
    opts.wakeNudge?.trim()
      ? `Wake nudge from the system:\n${opts.wakeNudge.trim()}`
      : null,
    "Conversation so far:",
    historyForPrompt(opts.history),
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(text) as { message?: unknown; done?: unknown };
    return {
      message: String(parsed.message ?? "").trim(),
      done: Boolean(parsed.done),
    };
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

async function summarizeAgentRunOutcome(opts: {
  agent: ProjectAgent;
  history: AgentConversationMessage[];
  status: AgentActivityOutcome;
  error?: string;
}): Promise<string> {
  const lastAgent = [...opts.history]
    .reverse()
    .find((m) => m.role === "agent")?.content;
  const lastCander = [...opts.history]
    .reverse()
    .find((m) => m.role === "cander")?.content;

  const fallback = fallbackRunOutcomeSummary({
    status: opts.status,
    lastAgent,
    lastCander,
    error: opts.error,
  });

  if (opts.status === "failed" || opts.status === "cancelled") {
    return fallback;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fallback;

  try {
    const openai = new OpenAI({ apiKey });
    const model = resolveOpenAIModel();
    const res = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: `Summarize this agent run for an Activity feed in 1–2 short sentences.
Focus on the outcome (what was done, blocked, or waiting) — not the full dialogue.
Status: ${opts.status}. Agent: ${opts.agent.name}.`,
        },
        {
          role: "user",
          content: historyForPrompt(opts.history.slice(-12)),
        },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim();
    return text ? text.slice(0, 400) : fallback;
  } catch {
    return fallback;
  }
}

export async function runAgent(
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const bundle = await loadAgentBundle(
    input.agentId,
    input.workspaceId,
    input.projectId,
    { profileId: input.profileId },
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
  let pausedWaiting = false;

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
    const workingHistory = [...history];
    const client = createSupabaseAdminClient();
    const runtimeChatId = `agent-runtime:${input.agentId}`;
    await ensureAgentRuntimeAiChat({
      client,
      chatId: runtimeChatId,
      ownerId: input.profileId,
      workspaceId: input.workspaceId,
      title: `${bundle.agent.name} · runtime`,
    });

    const scope =
      bundle.scope ??
      (await listAgentConnectorScopes({
        agentId: input.agentId,
        workspaceId: input.workspaceId,
        profileId: input.profileId,
      }));
    const selectedConnectionIds = scope.map((s) => s.connectionId);
    const scopePrompt = formatScopeForPrompt(scope);

    for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
      const plan = await planNextAgentMessage({
        agent: bundle.agent,
        history: workingHistory,
        wakeNudge: round === 0 ? input.message : undefined,
        round,
        scope,
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
        // Scope via selected connections — not agent-owned tools.
        ...(selectedConnectionIds.length
          ? { selectedConnectionIds }
          : {}),
        systemExtra: [
          `An automated agent named "${bundle.agent.name}" is speaking as the user.`,
          `The Agent is a delegator only. You (Cander) execute connectors/tools.`,
          `Follow normal Cander safety and approval rules. Do not grant the agent extra permissions.`,
          scopePrompt,
          `Agent standing instructions (for your awareness):`,
          bundle.agent.instructions.slice(0, 4000),
        ].join("\n"),
        agentRunId: run.id,
        aiChatId: runtimeChatId,
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
        pausedWaiting = true;
        break;
      }
      if (plan.done) break;
    }

    const outcomeStatus: AgentActivityOutcome = pausedWaiting
      ? "waiting"
      : "completed";
    const runStatus: AgentRunStatus = pausedWaiting ? "waiting" : "completed";
    const summary = await summarizeAgentRunOutcome({
      agent: bundle.agent,
      history: workingHistory,
      status: outcomeStatus,
    });

    const completed = await completeAgentRun({
      runId: run.id,
      workspaceId: input.workspaceId,
      status: runStatus,
      summary,
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
    const summary = fallbackRunOutcomeSummary({
      status: "failed",
      error: message,
      lastCander,
    });
    const failed = await completeAgentRun({
      runId: run.id,
      workspaceId: input.workspaceId,
      status: "failed",
      error: message,
      summary,
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
      createdBy: String(row.created_by ?? ""),
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
