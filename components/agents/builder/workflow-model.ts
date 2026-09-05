/**
 * Progressive workflow view over AgentRoute JSONB (trigger / condition / actions).
 */

import type {
  AgentRoute,
  AgentRouteAction,
  AgentRouteCondition,
  AgentRouteTrigger,
} from "@/lib/agents/types";
import {
  isPlaceholderActionLabel,
  isPlaceholderCondition,
  isPlaceholderTriggerLabel,
} from "./humanize";

export type WorkflowStepType =
  | "trigger"
  | "condition"
  | "action"
  | "wait"
  | "branch";

export type WorkflowStepStatus = "configured" | "incomplete" | "disabled";

export type WorkflowStep = {
  id: string;
  type: WorkflowStepType;
  routeId: string;
  actionIndex?: number;
  title: string;
  subtitle?: string;
  enabled: boolean;
  status: WorkflowStepStatus;
};

export type CanvasSelection =
  | { type: "agent"; tab?: "agent" | "access" | "skills" | "knowledge" }
  | { type: "step"; stepId: string };

export type AddStepKind = WorkflowStepType;

function cfg(obj: { config?: Record<string, unknown> } | undefined) {
  return (obj?.config ?? {}) as Record<string, unknown>;
}

function isSkippedCondition(condition: AgentRouteCondition): boolean {
  if (cfg(condition).skipped === true) return true;
  if (cfg(condition).branches) return false;
  return isPlaceholderCondition(condition.expression, condition.type);
}

function actionStepType(action: AgentRouteAction): WorkflowStepType {
  const t = (action.type ?? "").toLowerCase();
  if (t === "wait") return "wait";
  if (t === "branch") return "branch";
  return "action";
}

function stepStatus(opts: {
  enabled: boolean;
  incomplete: boolean;
}): WorkflowStepStatus {
  if (!opts.enabled) return "disabled";
  if (opts.incomplete) return "incomplete";
  return "configured";
}

function triggerIncomplete(trigger: AgentRouteTrigger): boolean {
  if (cfg(trigger).incomplete === true) return true;
  return isPlaceholderTriggerLabel(trigger.label);
}

function conditionIncomplete(condition: AgentRouteCondition): boolean {
  if (cfg(condition).incomplete === true) return true;
  if (cfg(condition).branches) {
    return !(condition.expression || cfg(condition).prompt);
  }
  return isPlaceholderCondition(condition.expression, condition.type);
}

function actionIncomplete(action: AgentRouteAction): boolean {
  if (cfg(action).incomplete === true) return true;
  return isPlaceholderActionLabel(action.label);
}

export function stepIdForTrigger(routeId: string) {
  return `${routeId}:trigger`;
}

export function stepIdForCondition(routeId: string) {
  return `${routeId}:condition`;
}

export function stepIdForAction(routeId: string, index: number) {
  return `${routeId}:action:${index}`;
}

export function parseStepId(stepId: string): {
  routeId: string;
  kind: "trigger" | "condition" | "action";
  actionIndex?: number;
} | null {
  const actionMatch = /^(.+):action:(\d+)$/.exec(stepId);
  if (actionMatch) {
    return {
      routeId: actionMatch[1]!,
      kind: "action",
      actionIndex: Number(actionMatch[2]),
    };
  }
  if (stepId.endsWith(":trigger")) {
    return { routeId: stepId.slice(0, -":trigger".length), kind: "trigger" };
  }
  if (stepId.endsWith(":condition")) {
    return {
      routeId: stepId.slice(0, -":condition".length),
      kind: "condition",
    };
  }
  return null;
}

/** Flatten routes into a linear list of canvas steps (no Route N chrome). */
export function routesToSteps(routes: AgentRoute[]): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const sorted = [...routes].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const route of sorted) {
    const routeEnabled = route.enabled !== false;

    steps.push({
      id: stepIdForTrigger(route.id),
      type: "trigger",
      routeId: route.id,
      title: triggerIncomplete(route.trigger)
        ? "Choose a trigger…"
        : route.trigger.label || "Trigger",
      subtitle: subtitleFromConfig(cfg(route.trigger)),
      enabled: routeEnabled,
      status: stepStatus({
        enabled: routeEnabled,
        incomplete: triggerIncomplete(route.trigger),
      }),
    });

    const showCondition =
      !isSkippedCondition(route.condition) ||
      Boolean(cfg(route.condition).branches);
    if (showCondition) {
      const branched = Boolean(cfg(route.condition).branches);
      steps.push({
        id: stepIdForCondition(route.id),
        type: branched ? "branch" : "condition",
        routeId: route.id,
        title: conditionIncomplete(route.condition)
          ? branched
            ? "Configure branch…"
            : "Choose a condition…"
          : route.condition.expression ||
            (branched ? "Agent decision" : "Condition"),
        subtitle: branched
          ? branchSubtitle(cfg(route.condition))
          : subtitleFromConfig(cfg(route.condition)),
        enabled: routeEnabled,
        status: stepStatus({
          enabled: routeEnabled,
          incomplete: conditionIncomplete(route.condition),
        }),
      });
    }

    route.actions.forEach((action, index) => {
      const type = actionStepType(action);
      steps.push({
        id: stepIdForAction(route.id, index),
        type,
        routeId: route.id,
        actionIndex: index,
        title: actionIncomplete(action)
          ? type === "wait"
            ? "Choose wait duration…"
            : "Choose an action…"
          : action.label || defaultActionTitle(type),
        subtitle: subtitleFromConfig(cfg(action)),
        enabled: routeEnabled && cfg(action).disabled !== true,
        status: stepStatus({
          enabled: routeEnabled && cfg(action).disabled !== true,
          incomplete: actionIncomplete(action),
        }),
      });
    });
  }

  return steps;
}

function defaultActionTitle(type: WorkflowStepType) {
  if (type === "wait") return "Wait";
  if (type === "branch") return "Branch";
  return "Action";
}

function subtitleFromConfig(config: Record<string, unknown>): string | undefined {
  const account = stringVal(config.accountLabel) || stringVal(config.account);
  const connector = stringVal(config.connectorLabel);
  const detail = stringVal(config.detail) || stringVal(config.filterSummary);
  const parts = [connector, account, detail].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function branchSubtitle(config: Record<string, unknown>): string | undefined {
  const branches = config.branches;
  if (!Array.isArray(branches) || !branches.length) return "Yes / No";
  return branches
    .map((b) =>
      typeof b === "object" && b && "label" in b
        ? String((b as { label: unknown }).label)
        : String(b),
    )
    .filter(Boolean)
    .join(" / ");
}

function stringVal(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function emptyTriggerRoute(name = "Workflow"): Partial<AgentRoute> & {
  name: string;
  enabled: boolean;
} {
  return {
    name,
    enabled: true,
    trigger: {
      type: "manual",
      label: "Choose a trigger…",
      config: { incomplete: true },
    },
    condition: {
      type: "always",
      expression: "always",
      config: { skipped: true },
    },
    actions: [],
  };
}

function cloneRoute(route: AgentRoute): AgentRoute {
  return {
    ...route,
    trigger: {
      ...route.trigger,
      config: { ...cfg(route.trigger) },
    },
    condition: {
      ...route.condition,
      config: { ...cfg(route.condition) },
    },
    actions: route.actions.map((a) => ({
      ...a,
      config: { ...cfg(a) },
    })),
  };
}

export type InsertPosition =
  | { kind: "after-agent" }
  | { kind: "after-step"; stepId: string };

/** Allowed step kinds for a given insert position. */
export function allowedAddKinds(
  routes: AgentRoute[],
  position: InsertPosition,
): AddStepKind[] {
  if (position.kind === "after-agent") {
    return ["trigger", "action"];
  }
  const parsed = parseStepId(position.stepId);
  if (!parsed) return ["condition", "action", "wait", "branch"];
  if (parsed.kind === "trigger") {
    return ["condition", "action", "wait", "branch"];
  }
  return ["condition", "action", "wait", "branch"];
}

/**
 * Insert a new step. Returns patch fields: upsertRoutes and/or deleteRouteIds.
 */
export function insertStep(
  routes: AgentRoute[],
  position: InsertPosition,
  kind: AddStepKind,
): { upsertRoutes: Array<Partial<AgentRoute> & { id?: string }> } {
  if (position.kind === "after-agent") {
    if (kind === "trigger") {
      return { upsertRoutes: [emptyTriggerRoute()] };
    }
    // Action from agent: create route with manual trigger + action
    return {
      upsertRoutes: [
        {
          ...emptyTriggerRoute(),
          trigger: {
            type: "manual",
            label: "Manual run",
            config: { source: "manual" },
          },
          actions: [newActionSeed(kind === "wait" ? "wait" : "action")],
        },
      ],
    };
  }

  const parsed = parseStepId(position.stepId);
  if (!parsed) return { upsertRoutes: [] };
  const route = routes.find((r) => r.id === parsed.routeId);
  if (!route) return { upsertRoutes: [] };
  const next = cloneRoute(route);

  if (kind === "trigger") {
    return { upsertRoutes: [emptyTriggerRoute(`Workflow ${routes.length + 1}`)] };
  }

  if (kind === "condition" || kind === "branch") {
    next.condition = {
      type: kind === "branch" ? "branch" : "rule",
      expression:
        kind === "branch" ? "Choose a decision…" : "Choose a condition…",
      config: {
        incomplete: true,
        skipped: false,
        ...(kind === "branch"
          ? {
              branches: [
                { id: "yes", label: "Yes" },
                { id: "no", label: "No" },
              ],
            }
          : {}),
      },
    };
    return { upsertRoutes: [next] };
  }

  const action = newActionSeed(kind);
  const insertAt =
    parsed.kind === "action" && parsed.actionIndex != null
      ? parsed.actionIndex + 1
      : parsed.kind === "trigger" || parsed.kind === "condition"
        ? 0
        : next.actions.length;

  // If inserting after trigger with skipped condition, insert at start of actions
  // If inserting after condition, insert at 0 or keep order
  let index = insertAt;
  if (parsed.kind === "trigger") {
    index = 0;
  } else if (parsed.kind === "condition") {
    index = 0;
  } else if (parsed.kind === "action" && parsed.actionIndex != null) {
    index = parsed.actionIndex + 1;
  }

  const actions = [...next.actions];
  actions.splice(index, 0, action);
  next.actions = actions;
  return { upsertRoutes: [next] };
}

function newActionSeed(kind: "action" | "wait" | WorkflowStepType): AgentRouteAction {
  if (kind === "wait") {
    return {
      type: "wait",
      label: "Choose wait duration…",
      config: { incomplete: true, durationHours: 24 },
    };
  }
  return {
    type: "action",
    label: "Choose an action…",
    config: { incomplete: true },
  };
}

export function deleteStep(
  routes: AgentRoute[],
  stepId: string,
): {
  upsertRoutes: Array<Partial<AgentRoute> & { id?: string }>;
  deleteRouteIds: string[];
} {
  const parsed = parseStepId(stepId);
  if (!parsed) return { upsertRoutes: [], deleteRouteIds: [] };
  const route = routes.find((r) => r.id === parsed.routeId);
  if (!route) return { upsertRoutes: [], deleteRouteIds: [] };

  if (parsed.kind === "trigger") {
    return { upsertRoutes: [], deleteRouteIds: [route.id] };
  }

  const next = cloneRoute(route);
  if (parsed.kind === "condition") {
    next.condition = {
      type: "always",
      expression: "always",
      config: { skipped: true },
    };
    return { upsertRoutes: [next], deleteRouteIds: [] };
  }

  if (parsed.kind === "action" && parsed.actionIndex != null) {
    next.actions = next.actions.filter((_, i) => i !== parsed.actionIndex);
    // If route has only incomplete trigger and no actions/condition, delete route
    if (
      next.actions.length === 0 &&
      isSkippedCondition(next.condition) &&
      triggerIncomplete(next.trigger)
    ) {
      return { upsertRoutes: [], deleteRouteIds: [route.id] };
    }
    return { upsertRoutes: [next], deleteRouteIds: [] };
  }

  return { upsertRoutes: [], deleteRouteIds: [] };
}

export function duplicateStep(
  routes: AgentRoute[],
  stepId: string,
): { upsertRoutes: Array<Partial<AgentRoute> & { id?: string }> } {
  const parsed = parseStepId(stepId);
  if (!parsed) return { upsertRoutes: [] };
  const route = routes.find((r) => r.id === parsed.routeId);
  if (!route) return { upsertRoutes: [] };

  if (parsed.kind === "trigger") {
    const copy = cloneRoute(route);
    return {
      upsertRoutes: [
        {
          name: `${route.name || "Workflow"} copy`,
          enabled: route.enabled,
          trigger: copy.trigger,
          condition: copy.condition,
          actions: copy.actions,
        },
      ],
    };
  }

  const next = cloneRoute(route);
  if (parsed.kind === "condition") {
    // Can't meaningfully duplicate condition alone — no-op
    return { upsertRoutes: [] };
  }
  if (parsed.kind === "action" && parsed.actionIndex != null) {
    const action = next.actions[parsed.actionIndex];
    if (!action) return { upsertRoutes: [] };
    next.actions.splice(parsed.actionIndex + 1, 0, {
      ...action,
      config: { ...cfg(action) },
    });
    return { upsertRoutes: [next] };
  }
  return { upsertRoutes: [] };
}

export function setStepEnabled(
  routes: AgentRoute[],
  stepId: string,
  enabled: boolean,
): { upsertRoutes: Array<Partial<AgentRoute> & { id?: string }> } {
  const parsed = parseStepId(stepId);
  if (!parsed) return { upsertRoutes: [] };
  const route = routes.find((r) => r.id === parsed.routeId);
  if (!route) return { upsertRoutes: [] };
  const next = cloneRoute(route);

  if (parsed.kind === "trigger" || parsed.kind === "condition") {
    next.enabled = enabled;
    return { upsertRoutes: [next] };
  }
  if (parsed.kind === "action" && parsed.actionIndex != null) {
    const action = next.actions[parsed.actionIndex];
    if (!action) return { upsertRoutes: [] };
    next.actions[parsed.actionIndex] = {
      ...action,
      config: { ...cfg(action), disabled: !enabled },
    };
    return { upsertRoutes: [next] };
  }
  return { upsertRoutes: [] };
}

export function updateTrigger(
  route: AgentRoute,
  patch: Partial<AgentRouteTrigger>,
): AgentRoute {
  const next = cloneRoute(route);
  next.trigger = {
    ...next.trigger,
    ...patch,
    config: {
      ...cfg(next.trigger),
      ...(patch.config ?? {}),
      incomplete: false,
    },
  };
  if (patch.label) next.trigger.label = patch.label;
  return next;
}

export function updateCondition(
  route: AgentRoute,
  patch: Partial<AgentRouteCondition>,
): AgentRoute {
  const next = cloneRoute(route);
  next.condition = {
    ...next.condition,
    ...patch,
    config: {
      ...cfg(next.condition),
      ...(patch.config ?? {}),
      skipped: false,
      incomplete: false,
    },
  };
  return next;
}

export function updateAction(
  route: AgentRoute,
  actionIndex: number,
  patch: Partial<AgentRouteAction>,
): AgentRoute {
  const next = cloneRoute(route);
  const current = next.actions[actionIndex];
  if (!current) return next;
  next.actions[actionIndex] = {
    ...current,
    ...patch,
    config: {
      ...cfg(current),
      ...(patch.config ?? {}),
      incomplete: false,
    },
  };
  return next;
}

export function findStep(
  steps: WorkflowStep[],
  stepId: string,
): WorkflowStep | null {
  return steps.find((s) => s.id === stepId) ?? null;
}

export function findRouteForStep(
  routes: AgentRoute[],
  stepId: string,
): AgentRoute | null {
  const parsed = parseStepId(stepId);
  if (!parsed) return null;
  return routes.find((r) => r.id === parsed.routeId) ?? null;
}
