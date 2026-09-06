/**
 * Compact agent definition shared by AI tools and the builder UI.
 * Maps onto ProjectAgentBundle / AgentRoute JSONB — no separate store.
 */

import type { ProjectAgentBundle } from "@/lib/agents/types";
import { routesToSteps } from "@/components/agents/builder/workflow-model";

export type AgentDefinitionStatus = "draft" | "active" | "paused";

export type AgentDefinitionStep = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  status: string;
  enabled: boolean;
  routeId: string;
};

export type AgentDefinition = {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  status: AgentDefinitionStatus;
  steps: AgentDefinitionStep[];
  connectorAccess: Array<{
    connectionId: string;
    connectorId: string;
    enabled: boolean;
  }>;
  tools: Array<{
    connectionId: string;
    toolId: string;
    enabled: boolean;
  }>;
  skills: Array<{ skillId: string; skillLabel: string }>;
  knowledge: Array<{
    id: string;
    sourceKind: string;
    sourceId: string;
    sourceLabel: string;
  }>;
};

export function bundleToAgentDefinition(
  bundle: ProjectAgentBundle,
): AgentDefinition {
  const steps = routesToSteps(bundle.routes).map((step) => ({
    id: step.id,
    type: step.type,
    title: step.title,
    subtitle: step.subtitle,
    status: step.status,
    enabled: step.enabled,
    routeId: step.routeId,
  }));

  return {
    id: bundle.agent.id,
    projectId: bundle.agent.projectId,
    workspaceId: bundle.agent.workspaceId,
    name: bundle.agent.name,
    description: bundle.agent.description,
    instructions: bundle.agent.instructions,
    enabled: bundle.agent.enabled,
    status: bundle.agent.enabled ? "active" : "paused",
    steps,
    connectorAccess: bundle.connectors.map((c) => ({
      connectionId: c.connectionId,
      connectorId: c.connectorId,
      enabled: c.enabled,
    })),
    tools: bundle.tools
      .filter((t) => t.enabled)
      .map((t) => ({
        connectionId: t.connectionId,
        toolId: t.toolId,
        enabled: t.enabled,
      })),
    skills: bundle.skills.map((s) => ({
      skillId: s.skillId,
      skillLabel: s.skillLabel,
    })),
    knowledge: bundle.knowledge.map((k) => ({
      id: k.id,
      sourceKind: k.sourceKind,
      sourceId: k.sourceId,
      sourceLabel: k.sourceLabel,
    })),
  };
}

/** Compact text the model can read without dumping full JSONB. */
export function formatAgentDefinitionSummary(def: AgentDefinition): string {
  const lines: string[] = [
    `Agent: ${def.name} (${def.id})`,
    `Status: ${def.status}${def.enabled ? "" : " (disabled)"}`,
  ];
  if (def.description.trim()) lines.push(`Description: ${def.description}`);
  if (def.instructions.trim()) {
    const trimmed =
      def.instructions.length > 400
        ? `${def.instructions.slice(0, 400)}…`
        : def.instructions;
    lines.push(`Instructions: ${trimmed}`);
  }
  if (!def.steps.length) {
    lines.push("Workflow: empty (Agent node only — no steps yet)");
  } else {
    lines.push("Workflow steps:");
    for (const step of def.steps) {
      lines.push(
        `- [${step.type}] ${step.title}${step.subtitle ? ` · ${step.subtitle}` : ""} (${step.status}) id=${step.id}`,
      );
    }
  }
  if (def.connectorAccess.length) {
    lines.push(
      `Connectors: ${def.connectorAccess
        .map((c) => `${c.connectorId}${c.enabled ? "" : " (off)"}`)
        .join(", ")}`,
    );
  } else {
    lines.push("Connectors: none granted");
  }
  if (def.tools.length) {
    lines.push(
      `Allowed tools: ${def.tools.map((t) => t.toolId).join(", ")}`,
    );
  }
  if (def.skills.length) {
    lines.push(`Skills: ${def.skills.map((s) => s.skillLabel).join(", ")}`);
  }
  if (def.knowledge.length) {
    lines.push(
      `Knowledge: ${def.knowledge.map((k) => k.sourceLabel).join(", ")}`,
    );
  }
  return lines.join("\n");
}

export function validateAgentDefinition(def: AgentDefinition): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!def.name.trim()) issues.push("Agent needs a name.");
  if (!def.steps.length) {
    issues.push("Workflow is empty — add a trigger or action.");
  }
  for (const step of def.steps) {
    if (step.status === "incomplete") {
      issues.push(`Incomplete ${step.type}: ${step.title} (${step.id})`);
    }
  }
  return { ok: issues.length === 0, issues };
}
