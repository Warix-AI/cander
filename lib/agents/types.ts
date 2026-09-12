/** Project Agent — Instructions + Schedule + Conversation. */

export type AgentStatus = "draft" | "active" | "paused";

export type AgentTrigger =
  | { type: "manual" }
  | {
      type: "schedule";
      /**
       * Friendly preset:
       * every_1_minute | every_5_minutes | every_15_minutes | every_30_minutes |
       * hourly | daily | custom
       */
      preset?: string;
      /** Derived cron expression */
      cron: string;
      timezone: string;
      /** Local time HH:mm when applicable (daily/custom) */
      time?: string;
    };

export type ProjectAgent = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  /** Human-readable Markdown: purpose, behavior, rules, what to ask Cander. */
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

/** Runtime conversation turn — Agent speaks as the user to Cander. */
export type AgentMessageRole = "agent" | "cander" | "system";

export type AgentConversationMessage = {
  id: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  runId: string | null;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
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
  idempotencyKey: string | null;
  triggerPayload: Record<string, unknown>;
};

export type ProjectAgentBundle = {
  agent: ProjectAgent;
  messages?: AgentConversationMessage[];
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
  /** @deprecated Mapped to instructions for builder-chat compatibility */
  createSkill?: {
    name: string;
    description?: string;
    markdown: string;
  };
  /** @deprecated Mapped to instructions for builder-chat compatibility */
  updateSkill?: {
    skillId: string;
    name?: string;
    description?: string;
    markdown?: string;
  };
};

export type AgentConfigProposal = {
  summary: string;
  patch: AgentConfigPatch;
  requiresConfirmation: boolean;
  confirmationReasons: string[];
};

export const BUDDY_STARTER_INSTRUCTIONS = `# Buddy

You are an automated extension of the user. On each wake-up, talk to Cander AI and ask it to do the work — you never call Gmail or other apps yourself.

## Goals
- Check whether **matt@warix.co** emailed within the last 24 hours (ask Cander to look).
- If there is a new message that needs a reply, ask Cander what it says, then ask Cander to draft a professional reply.
- Only ask Cander to send after you are satisfied with the draft, and only when sending is appropriate under the user’s usual approval rules.
- Do not invent deadlines or commitments the user did not authorize.

## Style
- Short, clear requests to Cander.
- Warm but professional tone in any draft you request.
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
  // Legacy gmail_new_message → manual (runtime no longer polls).
  if (t.type === "gmail_new_message") {
    return { type: "manual" };
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

export function errorMessageFromUnknown(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const row = err as Record<string, unknown>;
    if (typeof row.message === "string" && row.message.trim()) {
      return row.message;
    }
    try {
      return JSON.stringify(err).slice(0, 500);
    } catch {
      /* ignore */
    }
  }
  return "Agent run failed.";
}

/** @deprecated Dormant workflow canvas types — not used by V1 product UI. */
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
