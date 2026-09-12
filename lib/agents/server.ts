/**
 * Server helpers for project agents (admin client + membership).
 * Server-only — do not import from client components.
 *
 * Model: Agent = Instructions + Schedule + Conversation.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeNextRunAt } from "@/lib/agents/schedule";
import type {
  AgentConfigPatch,
  AgentConfigProposal,
  AgentConversationMessage,
  AgentMessageRole,
  AgentRun,
  AgentRunStatus,
  AgentStatus,
  AgentTrigger,
  ProjectAgent,
  ProjectAgentBundle,
} from "@/lib/agents/types";
import {
  agentStatusFromRow,
  BUDDY_STARTER_INSTRUCTIONS,
  parseAgentTrigger,
} from "@/lib/agents/types";
import {
  assertProjectAccess,
  assertProjectInWorkspace as projectExistsInWorkspace,
  assertWorkspaceMember as workspaceMemberCheck,
} from "@/lib/security/project-access";

export function newProjectAgentId() {
  return `pag_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function newAgentRunId() {
  return `arun_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function newAgentMessageId() {
  return `amsg_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function assertWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  return workspaceMemberCheck(workspaceId, userId);
}

export async function assertProjectInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<{ ok: true; kind: string | null } | { ok: false }> {
  const ok = await projectExistsInWorkspace(projectId, workspaceId);
  if (!ok) return { ok: false };
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("kind")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return { ok: true, kind: (data?.kind as string | null) ?? null };
}

export async function assertProjectAccessForUser(
  projectId: string,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true; kind: string | null } | { ok: false }> {
  const result = await assertProjectAccess({ projectId, workspaceId, userId });
  if (!result.ok) return { ok: false };
  return { ok: true, kind: result.project.kind };
}

function mapAgent(row: Record<string, unknown>): ProjectAgent {
  const enabled = Boolean(row.enabled);
  const status = agentStatusFromRow(row.status, enabled);
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    instructions: String(row.instructions ?? ""),
    enabled: status === "active" ? true : enabled && status !== "paused",
    status,
    trigger: parseAgentTrigger(row.trigger),
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
  };
}

function mapRun(row: Record<string, unknown>): AgentRun {
  const payload =
    row.trigger_payload && typeof row.trigger_payload === "object"
      ? (row.trigger_payload as Record<string, unknown>)
      : {};
  const status = String(row.status ?? "running");
  const normalized: AgentRunStatus =
    status === "approval_needed"
      ? "cancelled"
      : status === "completed" ||
          status === "failed" ||
          status === "cancelled" ||
          status === "running"
        ? status
        : "failed";
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    agentId: String(row.agent_id),
    triggerType: String(row.trigger_type ?? "manual"),
    status: normalized,
    startedAt: String(row.started_at ?? ""),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    summary: row.summary != null ? String(row.summary) : null,
    error: row.error != null ? String(row.error) : null,
    idempotencyKey:
      row.idempotency_key != null ? String(row.idempotency_key) : null,
    triggerPayload: payload,
  };
}

function mapMessage(row: Record<string, unknown>): AgentConversationMessage {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    agentId: String(row.agent_id),
    runId: row.run_id != null ? String(row.run_id) : null,
    role: String(row.role ?? "system") as AgentMessageRole,
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listProjectAgents(
  workspaceId: string,
  projectId: string,
): Promise<ProjectAgent[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("project_agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapAgent(row as Record<string, unknown>));
}

export async function ensureDefaultAgent(opts: {
  workspaceId: string;
  projectId: string;
  userId: string;
  name?: string;
}): Promise<ProjectAgent> {
  const existing = await listProjectAgents(opts.workspaceId, opts.projectId);
  if (existing[0]) return existing[0];
  let name = opts.name?.trim() || "";
  if (!name) {
    const admin = createSupabaseAdminClient();
    const { data: project } = await admin
      .from("projects")
      .select("title")
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId)
      .maybeSingle();
    name = String(project?.title ?? "").trim() || "Buddy";
  }
  return createProjectAgent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    userId: opts.userId,
    name,
    instructions: BUDDY_STARTER_INSTRUCTIONS,
  });
}

export async function createProjectAgent(opts: {
  workspaceId: string;
  projectId: string;
  userId: string;
  name: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
}): Promise<ProjectAgent> {
  const admin = createSupabaseAdminClient();
  const existing = await listProjectAgents(opts.workspaceId, opts.projectId);
  const id = newProjectAgentId();
  const instructions =
    (opts.instructions ?? "").trim() || BUDDY_STARTER_INSTRUCTIONS;
  const { data, error } = await admin
    .from("project_agents")
    .insert({
      id,
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      name: opts.name.trim() || "Buddy",
      description:
        opts.description ??
        "Automated extension of you that talks to Cander on a schedule.",
      instructions,
      enabled: opts.enabled ?? true,
      status: opts.enabled === false ? "paused" : "draft",
      trigger: { type: "manual" },
      sort_order: existing.length,
      created_by: opts.userId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create agent.");
  return mapAgent(data as Record<string, unknown>);
}

export async function getProjectAgent(
  agentId: string,
  workspaceId: string,
  projectId: string,
): Promise<ProjectAgent | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_agents")
    .select("*")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? mapAgent(data as Record<string, unknown>) : null;
}

export async function updateProjectAgent(
  agentId: string,
  workspaceId: string,
  projectId: string,
  patch: Partial<{
    name: string;
    description: string;
    instructions: string;
    enabled: boolean;
    status: AgentStatus;
    trigger: AgentTrigger;
    sortOrder: number;
    nextRunAt: string | null;
    lastTriggeredAt: string | null;
    icon: string | null;
    color: string | null;
    pinned: boolean;
  }>,
): Promise<ProjectAgent> {
  const admin = createSupabaseAdminClient();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim() || "Agent";
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.instructions !== undefined) row.instructions = patch.instructions;
  if (patch.enabled !== undefined) {
    row.enabled = patch.enabled;
    if (patch.status === undefined) {
      row.status = patch.enabled ? "active" : "paused";
    }
  }
  if (patch.status !== undefined) {
    row.status = patch.status;
    row.enabled = patch.status === "active";
  }
  if (patch.trigger !== undefined) {
    row.trigger = patch.trigger;
    if (patch.trigger.type === "manual") {
      row.next_run_at = null;
    } else if (
      patch.trigger.type === "schedule" &&
      patch.nextRunAt === undefined
    ) {
      const next = computeNextRunAt(patch.trigger);
      row.next_run_at = next ? next.toISOString() : null;
    }
  }
  if (patch.nextRunAt !== undefined) row.next_run_at = patch.nextRunAt;
  if (patch.lastTriggeredAt !== undefined) {
    row.last_triggered_at = patch.lastTriggeredAt;
  }
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.pinned !== undefined) row.pinned = patch.pinned;
  const { data, error } = await admin
    .from("project_agents")
    .update(row)
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not update agent.");
  return mapAgent(data as Record<string, unknown>);
}

export async function deleteProjectAgent(
  agentId: string,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("project_agents")
    .delete()
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
}

export async function duplicateProjectAgent(opts: {
  agentId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
}): Promise<ProjectAgentBundle> {
  const bundle = await loadAgentBundle(
    opts.agentId,
    opts.workspaceId,
    opts.projectId,
  );
  if (!bundle) throw new Error("Agent not found.");
  const copy = await createProjectAgent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    userId: opts.userId,
    name: `${bundle.agent.name} copy`,
    description: bundle.agent.description,
    instructions: bundle.agent.instructions,
    enabled: false,
  });
  await updateProjectAgent(copy.id, opts.workspaceId, opts.projectId, {
    trigger: bundle.agent.trigger,
    status: "draft",
  });
  const next = await loadAgentBundle(copy.id, opts.workspaceId, opts.projectId);
  if (!next) throw new Error("Could not load duplicated agent.");
  return next;
}

export async function listAgentMessages(opts: {
  agentId: string;
  workspaceId: string;
  limit?: number;
}): Promise<AgentConversationMessage[]> {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
  const { data, error } = await admin
    .from("agent_messages")
    .select("*")
    .eq("agent_id", opts.agentId)
    .eq("workspace_id", opts.workspaceId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    // Migration may not be applied yet in some envs.
    if (/does not exist|42P01/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapMessage(row as Record<string, unknown>));
}

export async function appendAgentMessage(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  role: AgentMessageRole;
  content: string;
  runId?: string | null;
}): Promise<AgentConversationMessage> {
  const admin = createSupabaseAdminClient();
  const id = newAgentMessageId();
  const { data, error } = await admin
    .from("agent_messages")
    .insert({
      id,
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      agent_id: opts.agentId,
      run_id: opts.runId ?? null,
      role: opts.role,
      content: opts.content,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not append agent message.");
  }
  return mapMessage(data as Record<string, unknown>);
}

export async function loadAgentBundle(
  agentId: string,
  workspaceId: string,
  projectId: string,
): Promise<ProjectAgentBundle | null> {
  const agent = await getProjectAgent(agentId, workspaceId, projectId);
  if (!agent) return null;
  const [messages, runs] = await Promise.all([
    listAgentMessages({ agentId, workspaceId, limit: 200 }),
    listAgentRuns({ agentId, workspaceId, limit: 20 }),
  ]);
  return { agent, messages, runs };
}

export async function createAgentRun(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  triggerType: string;
  userId?: string | null;
  idempotencyKey?: string | null;
  triggerPayload?: Record<string, unknown>;
}): Promise<AgentRun> {
  const admin = createSupabaseAdminClient();
  if (opts.idempotencyKey) {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("*")
      .eq("agent_id", opts.agentId)
      .eq("idempotency_key", opts.idempotencyKey)
      .maybeSingle();
    if (existing) return mapRun(existing as Record<string, unknown>);
  }
  const id = newAgentRunId();
  const { data, error } = await admin
    .from("agent_runs")
    .insert({
      id,
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      agent_id: opts.agentId,
      trigger_type: opts.triggerType,
      status: "running",
      created_by: opts.userId ?? null,
      idempotency_key: opts.idempotencyKey ?? null,
      trigger_payload: opts.triggerPayload ?? {},
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create run.");
  return mapRun(data as Record<string, unknown>);
}

export async function completeAgentRun(opts: {
  runId: string;
  workspaceId: string;
  status: AgentRunStatus;
  summary?: string;
  error?: string;
}): Promise<AgentRun> {
  const admin = createSupabaseAdminClient();
  const terminal = opts.status === "running" ? null : new Date().toISOString();
  const { data, error } = await admin
    .from("agent_runs")
    .update({
      status: opts.status,
      completed_at: terminal,
      summary: opts.summary ?? null,
      error: opts.error ?? null,
    })
    .eq("id", opts.runId)
    .eq("workspace_id", opts.workspaceId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not complete run.");
  return mapRun(data as Record<string, unknown>);
}

export async function getAgentRun(
  runId: string,
  workspaceId: string,
): Promise<AgentRun | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return data ? mapRun(data as Record<string, unknown>) : null;
}

export async function listAgentRuns(opts: {
  agentId: string;
  workspaceId: string;
  limit?: number;
}): Promise<AgentRun[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_runs")
    .select("*")
    .eq("agent_id", opts.agentId)
    .eq("workspace_id", opts.workspaceId)
    .order("started_at", { ascending: false })
    .limit(opts.limit ?? 40);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRun(r as Record<string, unknown>));
}

export async function countProjectAgentRunsSince(opts: {
  workspaceId: string;
  projectId: string;
  sinceIso: string;
}): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", opts.workspaceId)
    .eq("project_id", opts.projectId)
    .gte("started_at", opts.sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function applyAgentConfigPatch(opts: {
  agentId: string;
  workspaceId: string;
  projectId: string;
  patch: AgentConfigPatch;
}): Promise<ProjectAgentBundle> {
  const { agentId, workspaceId, projectId, patch } = opts;

  let instructions = patch.instructions;
  if (instructions === undefined && patch.createSkill?.markdown) {
    instructions = patch.createSkill.markdown;
  }
  if (instructions === undefined && patch.updateSkill?.markdown) {
    instructions = patch.updateSkill.markdown;
  }

  if (
    patch.name !== undefined ||
    patch.description !== undefined ||
    instructions !== undefined ||
    patch.enabled !== undefined ||
    patch.status !== undefined ||
    patch.trigger !== undefined ||
    patch.icon !== undefined ||
    patch.color !== undefined ||
    patch.pinned !== undefined
  ) {
    await updateProjectAgent(agentId, workspaceId, projectId, {
      name: patch.name,
      description: patch.description,
      instructions,
      enabled: patch.enabled,
      status: patch.status,
      trigger: patch.trigger,
      icon: patch.icon,
      color: patch.color,
      pinned: patch.pinned,
    });
  }

  const bundle = await loadAgentBundle(agentId, workspaceId, projectId);
  if (!bundle) throw new Error("Agent not found after patch.");
  return bundle;
}

export function proposeAgentConfigFromMessage(
  text: string,
  current: ProjectAgentBundle,
): AgentConfigProposal {
  const patch: AgentConfigPatch = {};
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  if (
    /instructions?\s*[:=]/i.test(text) ||
    /(?:set|update|change|rewrite)\s+instructions/i.test(text) ||
    /more professional/i.test(lower)
  ) {
    const after = text.split(/instructions?\s*[:=]/i)[1]?.trim();
    if (after) {
      patch.instructions = after.slice(0, 8000);
      reasons.push("Update instructions");
    } else if (/more professional/i.test(lower)) {
      patch.instructions = `${current.agent.instructions.trim()}\n\n## Tone\nUse a more professional, polished voice in every request to Cander.`;
      reasons.push("Make instructions more professional");
    }
  }

  if (/only respond to\s+([^\n.]+)/i.test(text)) {
    const who = text.match(/only respond to\s+([^\n.]+)/i)?.[1]?.trim();
    if (who) {
      patch.instructions = `${current.agent.instructions.trim()}\n\n## Filter\nOnly consider messages from **${who}**.`;
      reasons.push(`Only respond to ${who}`);
    }
  }

  if (/\bevery\s+minute\b/i.test(lower) || /\bevery\s+1\s*min/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "every_1_minute",
      cron: "* * * * *",
      timezone: "America/Denver",
    };
    patch.status = "active";
    reasons.push("Schedule every minute");
  } else if (/\bevery\s+5\s*min/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "every_5_minutes",
      cron: "*/5 * * * *",
      timezone: "America/Denver",
    };
    patch.status = "active";
    reasons.push("Schedule every 5 minutes");
  } else if (/\bevery\s+15\s*min/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "every_15_minutes",
      cron: "*/15 * * * *",
      timezone: "America/Denver",
    };
    patch.status = "active";
    reasons.push("Schedule every 15 minutes");
  } else if (/\bevery\s+30\s*min/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "every_30_minutes",
      cron: "*/30 * * * *",
      timezone: "America/Denver",
    };
    patch.status = "active";
    reasons.push("Schedule every 30 minutes");
  } else if (/\bevery\s+hour|hourly\b/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "hourly",
      cron: "0 * * * *",
      timezone: "America/Denver",
      time: "00:00",
    };
    patch.status = "active";
    reasons.push("Schedule hourly");
  } else if (/\bdaily\b|every\s+day\b/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "daily",
      cron: "0 9 * * *",
      timezone: "America/Denver",
      time: "09:00",
    };
    patch.status = "active";
    reasons.push("Schedule daily");
  } else if (/\bmanual\b|only when i run\b/i.test(lower)) {
    patch.trigger = { type: "manual" };
    reasons.push("Manual only");
  }

  if (/\bpause\b/i.test(lower)) {
    patch.status = "paused";
    reasons.push("Pause agent");
  } else if (/\bactivate\b|\bresume\b|\bunpause\b/i.test(lower)) {
    patch.status = "active";
    reasons.push("Activate agent");
  }

  return {
    summary: reasons.length
      ? reasons.join(" · ")
      : "No configuration change detected.",
    patch,
    requiresConfirmation: false,
    confirmationReasons: [],
  };
}

/** @deprecated Kept for older imports; runtime no longer writes run events. */
export async function appendAgentRunEvent(_opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  runId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  /* no-op — conversation uses agent_messages */
}

export async function listAgentActivity(opts: {
  agentId: string;
  workspaceId: string;
  limit?: number;
}): Promise<{ runs: AgentRun[]; messages: AgentConversationMessage[] }> {
  const [runs, messages] = await Promise.all([
    listAgentRuns({
      agentId: opts.agentId,
      workspaceId: opts.workspaceId,
      limit: opts.limit ?? 40,
    }),
    listAgentMessages({
      agentId: opts.agentId,
      workspaceId: opts.workspaceId,
      limit: 200,
    }),
  ]);
  return { runs, messages };
}
