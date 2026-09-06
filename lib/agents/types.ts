/** Project Agent types — Skills + scoped tools + trigger (routes dormant). */

export type AgentStatus = "draft" | "active" | "paused";

export type AgentTrigger =
  | { type: "manual" }
  | {
      type: "schedule";
      /** Friendly preset: hourly | daily | weekday | weekly | custom */
      preset?: string;
      /** Derived cron expression */
      cron: string;
      timezone: string;
      /** Local time HH:mm when applicable */
      time?: string;
    };

export type ProjectAgent = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  /** Legacy denormalized field — prefer Skills for behavior. */
  instructions: string;
  enabled: boolean;
  status: AgentStatus;
  trigger: AgentTrigger;
  nextRunAt: string | null;
  lastTriggeredAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** Workspace-scoped reusable skill. */
export type AgentSkill = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentSkillAssignment = {
  id: string;
  agentId: string;
  /** FK to agent_skills.id (also stored as skill_id for uniqueness). */
  skillId: string;
  skillLabel: string;
  skill?: AgentSkill | null;
};

export type AgentKnowledgeAssignment = {
  id: string;
  agentId: string;
  sourceKind: "knowledge_base" | "file" | "project_resource";
  sourceId: string;
  sourceLabel: string;
};

export type AgentConnectorScope = {
  id: string;
  agentId: string;
  connectionId: string;
  connectorId: string;
  enabled: boolean;
};

export type AgentToolPermission = {
  id: string;
  agentId: string;
  connectionId: string;
  toolId: string;
  enabled: boolean;
};

/** Dormant Zapier-style routes — kept for future deterministic workflows. */
export type AgentRouteTrigger = {
  type?: string;
  label?: string;
  config?: Record<string, unknown>;
};

export type AgentRouteCondition = {
  type?: string;
  expression?: string;
  config?: Record<string, unknown>;
};

export type AgentRouteAction = {
  type?: string;
  label?: string;
  config?: Record<string, unknown>;
};

export type AgentRoute = {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  trigger: AgentRouteTrigger;
  condition: AgentRouteCondition;
  actions: AgentRouteAction[];
  createdAt: string;
  updatedAt: string;
};

export type AgentRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentRun = {
  id: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  triggerType: string;
  status: AgentRunStatus;
  startedAt: string;
  completedAt: string | null;
  summary: string | null;
  error: string | null;
};

export type ProjectAgentBundle = {
  agent: ProjectAgent;
  skills: AgentSkillAssignment[];
  knowledge: AgentKnowledgeAssignment[];
  connectors: AgentConnectorScope[];
  tools: AgentToolPermission[];
  /** Dormant — not used by V1 product UI. */
  routes: AgentRoute[];
  runs?: AgentRun[];
};

export type AgentConfigPatch = {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
  status?: AgentStatus;
  trigger?: AgentTrigger;
  addSkills?: Array<{ skillId: string; skillLabel?: string }>;
  removeSkillIds?: string[];
  /** Create a new workspace skill and attach it. */
  createSkill?: {
    name: string;
    description?: string;
    markdown: string;
  };
  updateSkill?: {
    skillId: string;
    name?: string;
    description?: string;
    markdown?: string;
  };
  addKnowledge?: Array<{
    sourceKind: AgentKnowledgeAssignment["sourceKind"];
    sourceId: string;
    sourceLabel?: string;
  }>;
  removeKnowledgeIds?: string[];
  setConnectorEnabled?: Array<{
    connectionId: string;
    connectorId: string;
    enabled: boolean;
  }>;
  setToolPermissions?: Array<{
    connectionId: string;
    toolId: string;
    enabled: boolean;
  }>;
  /** @deprecated V1 product — routes dormant */
  upsertRoutes?: Array<Partial<AgentRoute> & { id?: string }>;
  /** @deprecated V1 product — routes dormant */
  deleteRouteIds?: string[];
};

export type AgentConfigProposal = {
  summary: string;
  patch: AgentConfigPatch;
  requiresConfirmation: boolean;
  confirmationReasons: string[];
};

export function parseAgentTrigger(raw: unknown): AgentTrigger {
  if (!raw || typeof raw !== "object") return { type: "manual" };
  const t = raw as Record<string, unknown>;
  if (t.type === "schedule" && typeof t.cron === "string") {
    return {
      type: "schedule",
      cron: t.cron,
      timezone:
        typeof t.timezone === "string" && t.timezone.trim()
          ? t.timezone
          : "America/Denver",
      ...(typeof t.preset === "string" ? { preset: t.preset } : {}),
      ...(typeof t.time === "string" ? { time: t.time } : {}),
    };
  }
  return { type: "manual" };
}

export function agentStatusFromRow(
  status: unknown,
  enabled: boolean,
): AgentStatus {
  if (status === "draft" || status === "active" || status === "paused") {
    return status;
  }
  return enabled ? "active" : "paused";
}
