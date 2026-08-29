/**
 * Provider-specific context budgets.
 * Source of truth for what each route may see — Apple models are responders,
 * not durable workflow stores.
 */

import type { RouteTarget } from "./types.ts";

export type ContextBudget = {
  maxBehaviorChars: number;
  maxTaskStateChars: number;
  maxSummaryChars: number;
  maxRecentMessages: number;
  includeInventory: boolean;
  includeTools: boolean;
  maxInventoryChars: number;
  maxDocumentExcerpts: number;
};

export const CONTEXT_BUDGETS: Record<RouteTarget, ContextBudget> = {
  on_device: {
    maxBehaviorChars: 1200,
    maxTaskStateChars: 800,
    maxSummaryChars: 600,
    maxRecentMessages: 6,
    includeInventory: false,
    includeTools: true, // only when toolNames non-empty
    maxInventoryChars: 0,
    maxDocumentExcerpts: 0,
  },
  pcc: {
    maxBehaviorChars: 4000,
    maxTaskStateChars: 2500,
    maxSummaryChars: 2500,
    maxRecentMessages: 24,
    includeInventory: true,
    includeTools: true,
    maxInventoryChars: 6000,
    maxDocumentExcerpts: 4,
  },
  cander_cloud: {
    maxBehaviorChars: 2000,
    maxTaskStateChars: 4000,
    maxSummaryChars: 2000,
    maxRecentMessages: 12,
    includeInventory: false,
    includeTools: true,
    maxInventoryChars: 0,
    maxDocumentExcerpts: 8,
  },
};

export type ContextPackageInput = {
  route: RouteTarget;
  behaviorRules?: string;
  taskStateText?: string;
  threadSummary?: string;
  recentMessages?: Array<{ role: string; content: string }>;
  inventoryText?: string;
  toolCatalog?: string;
  /** When false, strip tools even if budget allows. */
  allowTools?: boolean;
};

export type ContextPackage = {
  route: RouteTarget;
  budget: ContextBudget;
  behaviorRules: string;
  taskStateText: string;
  threadSummary: string;
  messages: Array<{ role: string; content: string }>;
  inventoryText: string;
  toolCatalog: string;
};

function clip(text: string | undefined, max: number): string {
  const t = (text || "").trim();
  if (!max || t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function buildContextPackage(input: ContextPackageInput): ContextPackage {
  const budget = CONTEXT_BUDGETS[input.route];
  const allowTools = input.allowTools !== false && Boolean(input.toolCatalog?.trim());
  const includeInventory =
    budget.includeInventory && Boolean(input.inventoryText?.trim());

  const messages = (input.recentMessages ?? [])
    .slice(-budget.maxRecentMessages)
    .map((m) => ({
      role: m.role,
      content: clip(m.content, 2000),
    }));

  return {
    route: input.route,
    budget,
    behaviorRules: clip(input.behaviorRules, budget.maxBehaviorChars),
    taskStateText: clip(input.taskStateText, budget.maxTaskStateChars),
    threadSummary: clip(input.threadSummary, budget.maxSummaryChars),
    messages,
    inventoryText: includeInventory
      ? clip(input.inventoryText, budget.maxInventoryChars)
      : "",
    toolCatalog: allowTools && budget.includeTools
      ? clip(input.toolCatalog, 4000)
      : "",
  };
}
