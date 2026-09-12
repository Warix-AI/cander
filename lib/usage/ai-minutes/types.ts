/**
 * Universal AI active-minute ledger types.
 * User-facing unit = minutes; internal economics = USD cost fields.
 */

export type AIUsageSource =
  | "chat"
  | "agent"
  | "expert"
  | "voice"
  | "image"
  | "search"
  | "connector"
  | "coding"
  | "website_build"
  | "app_build"
  | "automation"
  | "background_agent"
  | "document"
  | "speculation"
  | "other";

export type AIUsageFeature = AIUsageSource | (string & {});

export type AIUsageEventStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AIUsageLimitBehavior = "soft" | "hard";

export type AIUsageEvent = {
  id: string;
  userId: string;
  workspaceId: string | null;
  subscriptionId: string | null;
  planId: string;
  executionId: string;
  parentExecutionId: string | null;
  source: AIUsageSource;
  feature: string;
  model: string | null;
  provider: string | null;
  startedAt: string;
  endedAt: string | null;
  activeDurationMs: number | null;
  activeMinutes: number | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  status: AIUsageEventStatus;
  billableToUser: boolean;
  periodId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type StartAIUsageInput = {
  userId: string;
  workspaceId?: string | null;
  subscriptionId?: string | null;
  planId: string;
  /** Defaults to a new UUID. Pass reservation id to correlate with usage_events. */
  executionId?: string;
  parentExecutionId?: string | null;
  source: AIUsageSource;
  feature?: string;
  model?: string | null;
  provider?: string | null;
  estimatedCostUsd?: number | null;
  /** Child / nested spans should set false so they don't inflate user minutes. */
  billableToUser?: boolean;
  periodId?: string | null;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
};

export type FinishAIUsageInput = {
  executionId: string;
  status: Exclude<AIUsageEventStatus, "running">;
  endedAt?: Date;
  model?: string | null;
  provider?: string | null;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  metadata?: Record<string, unknown>;
};

export type AIMinutesSnapshot = {
  planId: string;
  includedMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  percentUsed: number;
  usedBillableMs: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  periodStart: string;
  periodEnd: string;
  status: "ok" | "approaching" | "exhausted";
  limitBehavior: AIUsageLimitBehavior;
  /** Display helpers */
  usedLabel: string;
  remainingLabel: string;
  detailLabel: string;
};
