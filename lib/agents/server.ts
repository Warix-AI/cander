/**
 * Server helpers for project agents (admin client + membership).
 * Server-only — do not import from client components.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeNextRunAt } from "@/lib/agents/schedule";
import type {
  AgentConfigPatch,
  AgentConfigProposal,
  AgentConnectorScope,
  AgentKnowledgeAssignment,
  AgentRoute,
  AgentRun,
  AgentSkill,
  AgentSkillAssignment,
  AgentStatus,
  AgentToolPermission,
  AgentTrigger,
  ProjectAgent,
  ProjectAgentBundle,
} from "@/lib/agents/types";
import {
  agentStatusFromRow,
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

export function newAgentChildId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function newAgentSkillId() {
  return `askill_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function newAgentRunId() {
  return `arun_${crypto.randomUUID().replace(/-/g, "")}`;
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

/** Prefer this over assertProjectInWorkspace for mutating routes. */
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
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapSkillRow(row: Record<string, unknown>): AgentSkill {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    markdown: String(row.markdown ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapSkillAssignment(
  row: Record<string, unknown>,
  skill?: AgentSkill | null,
): AgentSkillAssignment {
  const skillId = String(row.skill_ref_id ?? row.skill_id ?? "");
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    skillId,
    skillLabel: String(row.skill_label ?? skill?.name ?? ""),
    skill: skill ?? null,
  };
}

function mapRun(row: Record<string, unknown>): AgentRun {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    agentId: String(row.agent_id),
    triggerType: String(row.trigger_type ?? "manual"),
    status: row.status as AgentRun["status"],
    startedAt: String(row.started_at ?? ""),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    summary: row.summary != null ? String(row.summary) : null,
    error: row.error != null ? String(row.error) : null,
  };
}

function mapKnowledge(row: Record<string, unknown>): AgentKnowledgeAssignment {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    sourceKind: row.source_kind as AgentKnowledgeAssignment["sourceKind"],
    sourceId: String(row.source_id),
    sourceLabel: String(row.source_label ?? ""),
  };
}

function mapConnector(row: Record<string, unknown>): AgentConnectorScope {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    connectionId: String(row.connection_id),
    connectorId: String(row.connector_id),
    enabled: Boolean(row.enabled),
  };
}

function mapTool(row: Record<string, unknown>): AgentToolPermission {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    connectionId: String(row.connection_id),
    toolId: String(row.tool_id),
    enabled: Boolean(row.enabled),
  };
}

function mapRoute(row: Record<string, unknown>): AgentRoute {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    name: String(row.name ?? "Route"),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order ?? 0),
    trigger:
      row.trigger && typeof row.trigger === "object"
        ? (row.trigger as AgentRoute["trigger"])
        : {},
    condition:
      row.condition && typeof row.condition === "object"
        ? (row.condition as AgentRoute["condition"])
        : {},
    actions: actions as AgentRoute["actions"],
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
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
  return createProjectAgent({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    userId: opts.userId,
    name: opts.name ?? "Agent",
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
  const { data, error } = await admin
    .from("project_agents")
    .insert({
      id,
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      name: opts.name.trim() || "Agent",
      description: opts.description ?? "",
      instructions: opts.instructions ?? "",
      enabled: opts.enabled ?? true,
      status: opts.enabled === false ? "paused" : "draft",
      trigger: { type: "manual" },
      sort_order: existing.length,
      created_by: opts.userId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create agent.");
  const agent = mapAgent(data as Record<string, unknown>);
  // Seed a primary workspace skill from instructions
  const markdown =
    (opts.instructions ?? "").trim() ||
    `# ${agent.name}\n\nDescribe what this agent should do.`;
  await createAndAttachSkill({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: agent.id,
    userId: opts.userId,
    name: `${agent.name} skill`,
    markdown,
  });
  return agent;
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
    } else if (patch.nextRunAt === undefined) {
      const next = computeNextRunAt(patch.trigger);
      row.next_run_at = next ? next.toISOString() : null;
    }
  }
  if (patch.nextRunAt !== undefined) row.next_run_at = patch.nextRunAt;
  if (patch.lastTriggeredAt !== undefined) {
    row.last_triggered_at = patch.lastTriggeredAt;
  }
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
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
    enabled: bundle.agent.enabled,
  });
  await applyAgentConfigPatch({
    agentId: copy.id,
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    patch: {
      addSkills: bundle.skills.map((s) => ({
        skillId: s.skillId,
        skillLabel: s.skillLabel,
      })),
      addKnowledge: bundle.knowledge.map((k) => ({
        sourceKind: k.sourceKind,
        sourceId: k.sourceId,
        sourceLabel: k.sourceLabel,
      })),
      setConnectorEnabled: bundle.connectors.map((c) => ({
        connectionId: c.connectionId,
        connectorId: c.connectorId,
        enabled: c.enabled,
      })),
      setToolPermissions: bundle.tools.map((t) => ({
        connectionId: t.connectionId,
        toolId: t.toolId,
        enabled: t.enabled,
      })),
      upsertRoutes: bundle.routes.map((r) => ({
        name: r.name,
        enabled: r.enabled,
        trigger: r.trigger,
        condition: r.condition,
        actions: r.actions,
      })),
    },
  });
  const next = await loadAgentBundle(copy.id, opts.workspaceId, opts.projectId);
  if (!next) throw new Error("Could not load duplicated agent.");
  return next;
}

export async function loadAgentBundle(
  agentId: string,
  workspaceId: string,
  projectId: string,
): Promise<ProjectAgentBundle | null> {
  const agent = await getProjectAgent(agentId, workspaceId, projectId);
  if (!agent) return null;
  const admin = createSupabaseAdminClient();
  const [skillsRes, knowledge, connectors, tools, routes, runsRes] =
    await Promise.all([
      admin
        .from("agent_skill_assignments")
        .select("*")
        .eq("agent_id", agentId)
        .eq("workspace_id", workspaceId),
      admin
        .from("agent_knowledge_assignments")
        .select("*")
        .eq("agent_id", agentId)
        .eq("workspace_id", workspaceId),
      admin
        .from("agent_connector_scopes")
        .select("*")
        .eq("agent_id", agentId)
        .eq("workspace_id", workspaceId),
      admin
        .from("agent_tool_permissions")
        .select("*")
        .eq("agent_id", agentId)
        .eq("workspace_id", workspaceId),
      admin
        .from("agent_routes")
        .select("*")
        .eq("agent_id", agentId)
        .eq("workspace_id", workspaceId)
        .order("sort_order", { ascending: true }),
      admin
        .from("agent_runs")
        .select("*")
        .eq("agent_id", agentId)
        .eq("workspace_id", workspaceId)
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

  const assignmentRows = (skillsRes.data ?? []) as Record<string, unknown>[];
  const skillIds = [
    ...new Set(
      assignmentRows
        .map((r) => String(r.skill_ref_id ?? r.skill_id ?? ""))
        .filter(Boolean),
    ),
  ];
  const skillMap = new Map<string, AgentSkill>();
  if (skillIds.length) {
    const { data: skillRows } = await admin
      .from("agent_skills")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("id", skillIds);
    for (const s of skillRows ?? []) {
      const mapped = mapSkillRow(s as Record<string, unknown>);
      skillMap.set(mapped.id, mapped);
    }
  }

  return {
    agent,
    skills: assignmentRows.map((r) => {
      const sid = String(r.skill_ref_id ?? r.skill_id ?? "");
      return mapSkillAssignment(r, skillMap.get(sid) ?? null);
    }),
    knowledge: (knowledge.data ?? []).map((r) =>
      mapKnowledge(r as Record<string, unknown>),
    ),
    connectors: (connectors.data ?? []).map((r) =>
      mapConnector(r as Record<string, unknown>),
    ),
    tools: (tools.data ?? []).map((r) => mapTool(r as Record<string, unknown>)),
    routes: (routes.data ?? []).map((r) => mapRoute(r as Record<string, unknown>)),
    runs: (runsRes.data ?? []).map((r) => mapRun(r as Record<string, unknown>)),
  };
}

export async function listWorkspaceSkills(
  workspaceId: string,
): Promise<AgentSkill[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_skills")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapSkillRow(r as Record<string, unknown>));
}

export async function createAndAttachSkill(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  userId?: string;
  name: string;
  description?: string;
  markdown: string;
}): Promise<{ skill: AgentSkill; assignment: AgentSkillAssignment }> {
  const admin = createSupabaseAdminClient();
  const skillId = newAgentSkillId();
  const { data, error } = await admin
    .from("agent_skills")
    .insert({
      id: skillId,
      workspace_id: opts.workspaceId,
      name: opts.name.trim() || "Skill",
      description: opts.description ?? "",
      markdown: opts.markdown,
      created_by: opts.userId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create skill.");
  const skill = mapSkillRow(data as Record<string, unknown>);
  const assignId = newAgentChildId("ask");
  await admin.from("agent_skill_assignments").upsert(
    {
      id: assignId,
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      agent_id: opts.agentId,
      skill_id: skill.id,
      skill_label: skill.name,
      skill_ref_id: skill.id,
    },
    { onConflict: "agent_id,skill_id" },
  );
  return {
    skill,
    assignment: {
      id: assignId,
      agentId: opts.agentId,
      skillId: skill.id,
      skillLabel: skill.name,
      skill,
    },
  };
}

export async function updateWorkspaceSkill(opts: {
  workspaceId: string;
  skillId: string;
  patch: Partial<{ name: string; description: string; markdown: string }>;
}): Promise<AgentSkill> {
  const admin = createSupabaseAdminClient();
  const row: Record<string, unknown> = {};
  if (opts.patch.name !== undefined) row.name = opts.patch.name.trim() || "Skill";
  if (opts.patch.description !== undefined) {
    row.description = opts.patch.description;
  }
  if (opts.patch.markdown !== undefined) row.markdown = opts.patch.markdown;
  const { data, error } = await admin
    .from("agent_skills")
    .update(row)
    .eq("id", opts.skillId)
    .eq("workspace_id", opts.workspaceId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not update skill.");
  if (opts.patch.name !== undefined) {
    await admin
      .from("agent_skill_assignments")
      .update({ skill_label: opts.patch.name.trim() || "Skill" })
      .eq("skill_ref_id", opts.skillId)
      .eq("workspace_id", opts.workspaceId);
  }
  return mapSkillRow(data as Record<string, unknown>);
}

export async function createAgentRun(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  triggerType: string;
  userId?: string | null;
}): Promise<AgentRun> {
  const admin = createSupabaseAdminClient();
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
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create run.");
  return mapRun(data as Record<string, unknown>);
}

export async function completeAgentRun(opts: {
  runId: string;
  workspaceId: string;
  status: "completed" | "failed" | "cancelled";
  summary?: string;
  error?: string;
}): Promise<AgentRun> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_runs")
    .update({
      status: opts.status,
      completed_at: new Date().toISOString(),
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

export async function getLatestSuccessfulRun(
  agentId: string,
  workspaceId: string,
): Promise<AgentRun | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("agent_runs")
    .select("*")
    .eq("agent_id", agentId)
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
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
    .limit(opts.limit ?? 30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRun(r as Record<string, unknown>));
}

/** Count agent runs for a project since `sinceIso` (inclusive). */
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
  const admin = createSupabaseAdminClient();

  if (
    patch.name !== undefined ||
    patch.description !== undefined ||
    patch.instructions !== undefined ||
    patch.enabled !== undefined ||
    patch.status !== undefined ||
    patch.trigger !== undefined
  ) {
    await updateProjectAgent(agentId, workspaceId, projectId, {
      name: patch.name,
      description: patch.description,
      instructions: patch.instructions,
      enabled: patch.enabled,
      status: patch.status,
      trigger: patch.trigger,
    });
  }

  if (patch.createSkill) {
    await createAndAttachSkill({
      workspaceId,
      projectId,
      agentId,
      name: patch.createSkill.name,
      description: patch.createSkill.description,
      markdown: patch.createSkill.markdown,
    });
  }

  if (patch.updateSkill) {
    await updateWorkspaceSkill({
      workspaceId,
      skillId: patch.updateSkill.skillId,
      patch: {
        name: patch.updateSkill.name,
        description: patch.updateSkill.description,
        markdown: patch.updateSkill.markdown,
      },
    });
  }

  if (patch.addSkills?.length) {
    await admin.from("agent_skill_assignments").upsert(
      patch.addSkills.map((s) => ({
        id: newAgentChildId("ask"),
        workspace_id: workspaceId,
        project_id: projectId,
        agent_id: agentId,
        skill_id: s.skillId,
        skill_label: s.skillLabel ?? s.skillId,
        skill_ref_id: s.skillId,
      })),
      { onConflict: "agent_id,skill_id", ignoreDuplicates: false },
    );
  }
  if (patch.removeSkillIds?.length) {
    await admin
      .from("agent_skill_assignments")
      .delete()
      .eq("agent_id", agentId)
      .in("skill_id", patch.removeSkillIds);
  }

  if (patch.addKnowledge?.length) {
    for (const k of patch.addKnowledge) {
      await admin.from("agent_knowledge_assignments").upsert(
        {
          id: newAgentChildId("akn"),
          workspace_id: workspaceId,
          project_id: projectId,
          agent_id: agentId,
          source_kind: k.sourceKind,
          source_id: k.sourceId,
          source_label: k.sourceLabel ?? k.sourceId,
        },
        { onConflict: "agent_id,source_kind,source_id" },
      );
    }
  }
  if (patch.removeKnowledgeIds?.length) {
    await admin
      .from("agent_knowledge_assignments")
      .delete()
      .eq("agent_id", agentId)
      .in("id", patch.removeKnowledgeIds);
  }

  if (patch.setConnectorEnabled?.length) {
    for (const c of patch.setConnectorEnabled) {
      await admin.from("agent_connector_scopes").upsert(
        {
          id: newAgentChildId("acs"),
          workspace_id: workspaceId,
          project_id: projectId,
          agent_id: agentId,
          connection_id: c.connectionId,
          connector_id: c.connectorId,
          enabled: c.enabled,
        },
        { onConflict: "agent_id,connection_id" },
      );
    }
  }

  if (patch.setToolPermissions?.length) {
    for (const t of patch.setToolPermissions) {
      await admin.from("agent_tool_permissions").upsert(
        {
          id: newAgentChildId("atp"),
          workspace_id: workspaceId,
          project_id: projectId,
          agent_id: agentId,
          connection_id: t.connectionId,
          tool_id: t.toolId,
          enabled: t.enabled,
        },
        { onConflict: "agent_id,connection_id,tool_id" },
      );
    }
  }

  if (patch.deleteRouteIds?.length) {
    await admin
      .from("agent_routes")
      .delete()
      .eq("agent_id", agentId)
      .in("id", patch.deleteRouteIds);
  }

  if (patch.upsertRoutes?.length) {
    const existing = await loadAgentBundle(agentId, workspaceId, projectId);
    let order = existing?.routes.length ?? 0;
    for (const r of patch.upsertRoutes) {
      if (r.id) {
        await admin
          .from("agent_routes")
          .update({
            name: r.name ?? "Route",
            enabled: r.enabled ?? true,
            trigger: r.trigger ?? {},
            condition: r.condition ?? {},
            actions: r.actions ?? [],
            ...(r.sortOrder !== undefined ? { sort_order: r.sortOrder } : {}),
          })
          .eq("id", r.id)
          .eq("agent_id", agentId);
      } else {
        await admin.from("agent_routes").insert({
          id: newAgentChildId("art"),
          workspace_id: workspaceId,
          project_id: projectId,
          agent_id: agentId,
          name: r.name ?? "Route",
          enabled: r.enabled ?? true,
          sort_order: r.sortOrder ?? order++,
          trigger: r.trigger ?? {},
          condition: r.condition ?? {},
          actions: r.actions ?? [],
        });
      }
    }
  }

  const bundle = await loadAgentBundle(agentId, workspaceId, projectId);
  if (!bundle) throw new Error("Agent not found after patch.");
  return bundle;
}

/** Heuristic NL → structured patch for v1 (no live model required). */
export function proposeAgentConfigFromMessage(
  message: string,
  current: ProjectAgentBundle,
): AgentConfigProposal {
  const text = message.trim();
  const lower = text.toLowerCase();
  const patch: AgentConfigPatch = {};
  const confirmationReasons: string[] = [];

  const nameMatch = text.match(
    /(?:rename|call(?:ed)?|name)\s+(?:(?:it|this|the agent)\s+)?["“]?([^"”\n.]+)["”]?/i,
  );
  if (nameMatch?.[1]) {
    patch.name = nameMatch[1].trim();
  }

  const descMatch = text.match(
    /(?:description|describe)\s*[:=]\s*["“]?([^"”\n]+)["”]?/i,
  );
  if (descMatch?.[1]) {
    patch.description = descMatch[1].trim();
  }

  if (
    /instructions?\s*[:=]/i.test(text) ||
    /(?:set|update|change)\s+instructions/i.test(text)
  ) {
    const after = text.split(/instructions?\s*[:=]/i)[1]?.trim();
    if (after) {
      patch.createSkill = {
        name: "Primary skill",
        markdown: `# Skill\n\n${after}`,
      };
    }
  } else if (/you (?:are|should)|always |never /i.test(text) && text.length > 40) {
    patch.createSkill = {
      name: "Primary skill",
      markdown: `# Skill\n\n${text}`,
    };
  }

  if (/\benable\b/.test(lower) && /\bagent\b/.test(lower)) {
    patch.enabled = true;
  }
  if (/\bdisable\b/.test(lower) && /\bagent\b/.test(lower)) {
    patch.enabled = false;
  }

  if (/\badd skill\b|\bcreate skill\b/i.test(lower) && text.length > 20) {
    patch.createSkill = {
      name: "Generated skill",
      markdown: `# Skill\n\n${text}`,
    };
  }

  const skillRemove = text.match(/remove skill\s+["“]?([^"”\n.]+)["”]?/i);
  if (skillRemove?.[1]) {
    const label = skillRemove[1].trim().toLowerCase();
    const match = current.skills.find(
      (s) =>
        s.skillLabel.toLowerCase() === label ||
        s.skillId.toLowerCase() === label,
    );
    if (match) patch.removeSkillIds = [match.skillId];
  }

  if (/\bevery weekday\b|\bweekdays?\b.*\b(am|pm|morning)\b/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "weekday",
      cron: "0 9 * * 1-5",
      timezone: "America/Denver",
      time: "09:00",
    };
    patch.status = "active";
  } else if (/\bevery day\b|\bdaily\b/i.test(lower)) {
    patch.trigger = {
      type: "schedule",
      preset: "daily",
      cron: "0 9 * * *",
      timezone: "America/Denver",
      time: "09:00",
    };
    patch.status = "active";
  } else if (/\bmanual(ly)?\b.*\brun\b|\brun manually\b/i.test(lower)) {
    patch.trigger = { type: "manual" };
  }

  if (/\ballow all tools?\b|\benable all tools?\b/i.test(text)) {
    confirmationReasons.push("Enabling all tools requires confirmation.");
    patch.setToolPermissions = current.tools.map((t) => ({
      connectionId: t.connectionId,
      toolId: t.toolId,
      enabled: true,
    }));
  }
  if (/\bdisable all tools?\b|\bread only\b/i.test(text)) {
    confirmationReasons.push("Changing tool permissions requires confirmation.");
    patch.setToolPermissions = current.tools.map((t) => ({
      connectionId: t.connectionId,
      toolId: t.toolId,
      enabled: false,
    }));
  }

  const keys = Object.keys(patch);
  if (!keys.length) {
    return {
      summary:
        "I could not map that to a config change. Try describing the skill, schedule, or tool access you want.",
      patch: {},
      requiresConfirmation: false,
      confirmationReasons: [],
    };
  }

  const identityOnly =
    keys.every((k) =>
      ["name", "description", "enabled", "status"].includes(k),
    ) && !confirmationReasons.length;

  return {
    summary: `Proposed updates: ${keys.join(", ")}.`,
    patch,
    requiresConfirmation: !identityOnly,
    confirmationReasons,
  };
}
