/**
 * Server helpers for project agents (admin client + membership).
 * Server-only — do not import from client components.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AgentConfigPatch,
  AgentConfigProposal,
  AgentConnectorScope,
  AgentKnowledgeAssignment,
  AgentRoute,
  AgentSkillAssignment,
  AgentToolPermission,
  ProjectAgent,
  ProjectAgentBundle,
} from "@/lib/agents/types";

export function newProjectAgentId() {
  return `pag_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function newAgentChildId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function assertWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function assertProjectInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<{ ok: true; kind: string | null } | { ok: false }> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id, kind")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return { ok: false };
  return { ok: true, kind: (data.kind as string | null) ?? null };
}

function mapAgent(row: Record<string, unknown>): ProjectAgent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    instructions: String(row.instructions ?? ""),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapSkill(row: Record<string, unknown>): AgentSkillAssignment {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    skillId: String(row.skill_id),
    skillLabel: String(row.skill_label ?? ""),
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
    sortOrder: number;
  }>,
): Promise<ProjectAgent> {
  const admin = createSupabaseAdminClient();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim() || "Agent";
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.instructions !== undefined) row.instructions = patch.instructions;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
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
  const [skills, knowledge, connectors, tools, routes] = await Promise.all([
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
  ]);
  return {
    agent,
    skills: (skills.data ?? []).map((r) => mapSkill(r as Record<string, unknown>)),
    knowledge: (knowledge.data ?? []).map((r) =>
      mapKnowledge(r as Record<string, unknown>),
    ),
    connectors: (connectors.data ?? []).map((r) =>
      mapConnector(r as Record<string, unknown>),
    ),
    tools: (tools.data ?? []).map((r) => mapTool(r as Record<string, unknown>)),
    routes: (routes.data ?? []).map((r) => mapRoute(r as Record<string, unknown>)),
  };
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
    patch.enabled !== undefined
  ) {
    await updateProjectAgent(agentId, workspaceId, projectId, {
      name: patch.name,
      description: patch.description,
      instructions: patch.instructions,
      enabled: patch.enabled,
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
    if (after) patch.instructions = after;
  } else if (/you (?:are|should)|always |never /i.test(text) && text.length > 40) {
    patch.instructions = text;
  }

  if (/\benable\b/.test(lower) && /\bagent\b/.test(lower)) {
    patch.enabled = true;
  }
  if (/\bdisable\b/.test(lower) && /\bagent\b/.test(lower)) {
    patch.enabled = false;
  }

  const skillAdd = text.match(/add skill\s+["“]?([^"”\n.]+)["”]?/i);
  if (skillAdd?.[1]) {
    const label = skillAdd[1].trim();
    patch.addSkills = [
      {
        skillId: `skill_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        skillLabel: label,
      },
    ];
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

  if (/\badd route\b|\bwhen\b.+\bdo\b/i.test(lower)) {
    patch.upsertRoutes = [
      {
        name: "New route",
        enabled: true,
        trigger: { type: "manual", label: "WHEN (configure)" },
        condition: { type: "always", expression: "IF always" },
        actions: [{ type: "notify", label: "DO (configure)" }],
      },
    ];
  }

  const keys = Object.keys(patch);
  if (!keys.length) {
    return {
      summary:
        "I could not map that to a config change. Try: rename, set instructions, add skill …, or add route.",
      patch: {},
      requiresConfirmation: false,
      confirmationReasons: [],
    };
  }

  const identityOnly =
    keys.every((k) =>
      ["name", "description", "instructions", "enabled"].includes(k),
    ) && !confirmationReasons.length;

  return {
    summary: `Proposed updates: ${keys.join(", ")}.`,
    patch,
    requiresConfirmation: !identityOnly,
    confirmationReasons,
  };
}
