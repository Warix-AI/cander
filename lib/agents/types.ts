/** Project Agent types — Instructions + Connections + Schedule + Activity. */

export type AgentStatus = "draft" | "active" | "paused";

export type AgentApprovalMode = "auto" | "draft" | "require_approval";

export type AgentTrigger =
  | { type: "manual" }
  | {
      type: "schedule";
      /** Friendly preset: hourly | every_few_hours | daily | weekday | weekly | custom */
      preset?: string;
      /** Derived cron expression */
      cron: string;
      timezone: string;
      /** Local time HH:mm when applicable */
      time?: string;
    }
  | {
      type: "gmail_new_message";
      connectionId: string;
      filter: { fromContains?: string; query?: string };
      cursor?: { lastCheckedAt?: string };
    };

export type ProjectAgent = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  /** Human-readable Markdown behavioral definition. */
  instructions: string;
  enabled: boolean;
  status: AgentStatus;
  trigger: AgentTrigger;
  nextRunAt: string | null;
  lastTriggeredAt: string | null;
  icon: string | null;
  color: string | null;
  pinned: boolean;
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
  approvalMode: AgentApprovalMode;
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
  | "cancelled"
  | "approval_needed";

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
  idempotencyKey: string | null;
  triggerPayload: Record<string, unknown>;
};

export type AgentRunEventType =
  | "trigger_received"
  | "work_started"
  | "tool_called"
  | "draft_created"
  | "approval_needed"
  | "approved"
  | "rejected"
  | "revised"
  | "completed"
  | "error"
  | "user_message";

export type AgentRunEvent = {
  id: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  runId: string;
  seq: number;
  eventType: AgentRunEventType | string;
  payload: Record<string, unknown>;
  createdAt: string;
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
  icon?: string | null;
  color?: string | null;
  pinned?: boolean;
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
    approvalMode?: AgentApprovalMode;
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

export const BUDDY_STARTER_INSTRUCTIONS = `# Buddy

You watch Gmail for messages that need a reply.

## Goals
- Look for new messages matching the configured filter (e.g. from a specific person).
- Decide whether they need a response.
- Draft a concise, friendly reply.
- Do **not** promise deadlines or make commitments the user did not authorize.
- **Never send** email unless the user has approved the draft (or send is set to automatic).

## Style
- Short paragraphs.
- Warm but professional.
- Ask clarifying questions only when necessary.
`;

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
  if (t.type === "gmail_new_message" && typeof t.connectionId === "string") {
    const filter =
      t.filter && typeof t.filter === "object"
        ? (t.filter as Record<string, unknown>)
        : {};
    const cursor =
      t.cursor && typeof t.cursor === "object"
        ? (t.cursor as Record<string, unknown>)
        : undefined;
    return {
      type: "gmail_new_message",
      connectionId: t.connectionId,
      filter: {
        ...(typeof filter.fromContains === "string"
          ? { fromContains: filter.fromContains }
          : {}),
        ...(typeof filter.query === "string" ? { query: filter.query } : {}),
      },
      ...(cursor
        ? {
            cursor: {
              ...(typeof cursor.lastCheckedAt === "string"
                ? { lastCheckedAt: cursor.lastCheckedAt }
                : {}),
            },
          }
        : {}),
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

export function parseApprovalMode(raw: unknown): AgentApprovalMode {
  if (raw === "auto" || raw === "draft" || raw === "require_approval") {
    return raw;
  }
  return "require_approval";
}

/** Tools that must never auto-run without explicit promotion. */
export function isHighImpactTool(toolId: string): boolean {
  const id = toolId.toLowerCase();
  return (
    /\.(send|reply|delete|archive|create|update|write|refund|charge|pay|purchase|transfer)/.test(
      id,
    ) ||
    id.includes("gmail.send") ||
    id.includes("gmail.reply")
  );
}

export function defaultApprovalModeForTool(toolId: string): AgentApprovalMode {
  if (isHighImpactTool(toolId)) return "require_approval";
  if (/\.(search|list|read|get|fetch)/i.test(toolId)) return "auto";
  return "draft";
}
