/**
 * Shared agent mutation helpers — AI tools and the builder UI use the same shapes.
 */

import type { AgentConfigPatch, AgentRoute, ProjectAgentBundle } from "@/lib/agents/types";
import {
  deleteStep,
  insertStep,
  parseStepId,
  routesToSteps,
  setStepEnabled,
  updateAction,
  updateCondition,
  updateTrigger,
  type AddStepKind,
  type InsertPosition,
} from "@/components/agents/builder/workflow-model";
import { humanizeToolId } from "@/components/agents/builder/humanize";

export type AgentMutationResult = {
  patch: AgentConfigPatch;
  summary: string;
};

export function mutationUpdateMetadata(opts: {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
}): AgentMutationResult {
  const patch: AgentConfigPatch = {};
  if (opts.name !== undefined) patch.name = opts.name;
  if (opts.description !== undefined) patch.description = opts.description;
  if (opts.instructions !== undefined) patch.instructions = opts.instructions;
  if (opts.enabled !== undefined) patch.enabled = opts.enabled;
  const parts: string[] = [];
  if (opts.name !== undefined) parts.push("name");
  if (opts.description !== undefined) parts.push("description");
  if (opts.instructions !== undefined) parts.push("instructions");
  if (opts.enabled !== undefined) {
    parts.push(opts.enabled ? "enabled" : "disabled");
  }
  return {
    patch,
    summary: parts.length
      ? `Updated agent ${parts.join(", ")}`
      : "No metadata changes",
  };
}

export function mutationAddStep(opts: {
  routes: AgentRoute[];
  kind: AddStepKind;
  afterStepId?: string | null;
}): AgentMutationResult {
  let position: InsertPosition;
  if (opts.afterStepId) {
    position = { kind: "after-step", stepId: opts.afterStepId };
  } else if (!opts.routes.length || opts.kind === "trigger") {
    position = { kind: "after-agent" };
  } else {
    const steps = routesToSteps(opts.routes);
    const last = steps.at(-1);
    position = last
      ? { kind: "after-step", stepId: last.id }
      : { kind: "after-agent" };
  }
  const { upsertRoutes } = insertStep(opts.routes, position, opts.kind);
  return {
    patch: { upsertRoutes },
    summary: `Adding ${opts.kind}`,
  };
}

export function mutationDeleteStep(opts: {
  routes: AgentRoute[];
  stepId: string;
}): AgentMutationResult {
  const { upsertRoutes, deleteRouteIds } = deleteStep(opts.routes, opts.stepId);
  return {
    patch: {
      ...(upsertRoutes.length ? { upsertRoutes } : {}),
      ...(deleteRouteIds.length ? { deleteRouteIds } : {}),
    },
    summary: "Removed step",
  };
}

export function mutationSetStepEnabled(opts: {
  routes: AgentRoute[];
  stepId: string;
  enabled: boolean;
}): AgentMutationResult {
  const { upsertRoutes } = setStepEnabled(
    opts.routes,
    opts.stepId,
    opts.enabled,
  );
  return {
    patch: { upsertRoutes },
    summary: opts.enabled ? "Enabled step" : "Disabled step",
  };
}

export function mutationUpdateStep(opts: {
  routes: AgentRoute[];
  stepId: string;
  label?: string;
  type?: string;
  config?: Record<string, unknown>;
  expression?: string;
}): AgentMutationResult | { error: string } {
  const parsed = parseStepId(opts.stepId);
  if (!parsed) return { error: `Unknown step id: ${opts.stepId}` };
  const route = opts.routes.find((r) => r.id === parsed.routeId);
  if (!route) return { error: `Route not found for step ${opts.stepId}` };

  let next: AgentRoute = route;
  if (parsed.kind === "trigger") {
    next = updateTrigger(route, {
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.label ? { label: opts.label } : {}),
      ...(opts.config ? { config: opts.config } : {}),
    });
  } else if (parsed.kind === "condition") {
    next = updateCondition(route, {
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.expression || opts.label
        ? { expression: opts.expression || opts.label }
        : {}),
      ...(opts.config ? { config: opts.config } : {}),
    });
  } else if (parsed.kind === "action" && parsed.actionIndex != null) {
    next = updateAction(route, parsed.actionIndex, {
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.label ? { label: opts.label } : {}),
      ...(opts.config ? { config: opts.config } : {}),
    });
  } else {
    return { error: `Cannot update step ${opts.stepId}` };
  }

  return {
    patch: { upsertRoutes: [next] },
    summary: opts.label
      ? `Updated step · ${opts.label}`
      : "Updated step",
  };
}

export function mutationGrantTools(opts: {
  connectionId: string;
  connectorId: string;
  toolIds: string[];
  enableConnector?: boolean;
}): AgentMutationResult {
  const labels = opts.toolIds.map(humanizeToolId).join(", ");
  return {
    patch: {
      setConnectorEnabled: [
        {
          connectionId: opts.connectionId,
          connectorId: opts.connectorId,
          enabled: opts.enableConnector !== false,
        },
      ],
      setToolPermissions: opts.toolIds.map((toolId) => ({
        connectionId: opts.connectionId,
        toolId,
        enabled: true,
      })),
    },
    summary: labels
      ? `Allowed ${opts.connectorId}: ${labels}`
      : `Granted ${opts.connectorId}`,
  };
}

export function mutationRevokeTools(opts: {
  connectionId: string;
  connectorId: string;
  toolIds: string[];
}): AgentMutationResult {
  return {
    patch: {
      setToolPermissions: opts.toolIds.map((toolId) => ({
        connectionId: opts.connectionId,
        toolId,
        enabled: false,
      })),
    },
    summary: `Disallowed tools on ${opts.connectorId}`,
  };
}

export function mutationAttachSkill(opts: {
  skillId: string;
  skillLabel: string;
}): AgentMutationResult {
  return {
    patch: {
      addSkills: [{ skillId: opts.skillId, skillLabel: opts.skillLabel }],
    },
    summary: `Attached skill · ${opts.skillLabel}`,
  };
}

export function mutationRemoveSkill(opts: {
  skillId: string;
}): AgentMutationResult {
  return {
    patch: { removeSkillIds: [opts.skillId] },
    summary: "Removed skill",
  };
}

export function mutationAttachKnowledge(opts: {
  sourceKind: "knowledge_base" | "file" | "project_resource";
  sourceId: string;
  sourceLabel: string;
}): AgentMutationResult {
  return {
    patch: {
      addKnowledge: [
        {
          sourceKind: opts.sourceKind,
          sourceId: opts.sourceId,
          sourceLabel: opts.sourceLabel,
        },
      ],
    },
    summary: `Attached knowledge · ${opts.sourceLabel}`,
  };
}

export function mutationRemoveKnowledge(opts: {
  knowledgeId: string;
}): AgentMutationResult {
  return {
    patch: { removeKnowledgeIds: [opts.knowledgeId] },
    summary: "Removed knowledge",
  };
}

/** Resolve first agent id from a bundle list or explicit id. */
export function resolveAgentIdFromBundle(
  bundle: ProjectAgentBundle | null,
  explicit?: string | null,
): string | null {
  const id = explicit?.trim();
  if (id) return id;
  return bundle?.agent.id ?? null;
}
