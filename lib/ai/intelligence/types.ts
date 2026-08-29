/**
 * Cander Intelligence — shared types for routing, tasks, and privacy.
 * Pure TS (no path aliases) so Edge / node:test can reuse the same contracts.
 *
 * PRIVACY: Never surface providers, tools, agents, sandboxes, or routing
 * internals in user-visible copy unless the user explicitly asks.
 */

/** Spec task types — classify first, then route. */
export type IntelligenceTaskType =
  | "conversational"
  | "local_action"
  | "reasoning_heavy"
  | "execution"
  | "research"
  | "release";

/** Where inference / orchestration runs. */
export type RouteTarget = "on_device" | "pcc" | "cander_cloud";

export type RoutingBudgets = {
  maxModelRequests: number;
  maxWorkerRetries: number;
  maxSandboxMinutes: number;
  maxSandboxCreations: number;
};

export type RoutingDecision = {
  taskType: IntelligenceTaskType;
  target: RouteTarget;
  reason: string;
  /** Domains the model may see this turn (empty = conversation-only). */
  domains: string[];
  toolNames: string[];
  budgets: RoutingBudgets;
  /** Feature outcomes that affected the route. */
  flags: {
    pccEnabled: boolean;
    cloudWorkEnabled: boolean;
    sandboxEnabled: boolean;
  };
};

/** Durable cloud task statuses (Phase 2+). */
export type AiTaskStatus =
  | "drafting"
  | "awaiting_user"
  | "queued"
  | "running"
  | "verifying"
  | "ready_for_review"
  | "ready_to_publish"
  | "published"
  | "failed"
  | "cancelled";

export type AiTaskType = IntelligenceTaskType | "coding" | "multi_step";

export const DEFAULT_ROUTING_BUDGETS: RoutingBudgets = {
  maxModelRequests: 8,
  maxWorkerRetries: 2,
  maxSandboxMinutes: 15,
  maxSandboxCreations: 3,
};

/** Stable capability IDs (spec) → current tool names. */
export const CAPABILITY_TO_TOOLS: Record<string, readonly string[]> = {
  ask_user: ["ui.ask_clarification", "ui.confirm"],
  retrieve_active_context: [],
  navigate: ["nav.open", "panel.open", "panel.close"],
  create_work_task: ["create_work_task"],
  check_work_task: ["check_work_task"],
  request_publish_approval: ["request_publish_approval"],
  projects: ["project.create", "project.open"],
  workspace_search: ["workspace.search"],
  knowledge_search: ["knowledge.search"],
  web_search: ["web.search"],
  research: [],
  release: ["request_publish_approval"],
};
