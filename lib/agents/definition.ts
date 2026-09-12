/**
 * Compact agent definition for AI tools and the builder UI.
 * Instructions + Schedule (no agent-scoped connectors).
 */

import type { ProjectAgentBundle } from "@/lib/agents/types";

export type AgentDefinitionStatus = "draft" | "active" | "paused";

export type AgentDefinition = {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  description: string;
  status: AgentDefinitionStatus;
  instructions: string;
  trigger: ProjectAgentBundle["agent"]["trigger"];
  nextRunAt: string | null;
  recentRuns: Array<{
    id: string;
    status: string;
    triggerType: string;
    startedAt: string;
    summary: string | null;
  }>;
  messageCount: number;
};

export function bundleToAgentDefinition(
  bundle: ProjectAgentBundle,
): AgentDefinition {
  return {
    id: bundle.agent.id,
    projectId: bundle.agent.projectId,
    workspaceId: bundle.agent.workspaceId,
    name: bundle.agent.name,
    description: bundle.agent.description,
    status: bundle.agent.status,
    instructions: bundle.agent.instructions,
    trigger: bundle.agent.trigger,
    nextRunAt: bundle.agent.nextRunAt,
    recentRuns: (bundle.runs ?? []).slice(0, 5).map((r) => ({
      id: r.id,
      status: r.status,
      triggerType: r.triggerType,
      startedAt: r.startedAt,
      summary: r.summary,
    })),
    messageCount: bundle.messages?.length ?? 0,
  };
}

export function formatAgentDefinitionSummary(def: AgentDefinition): string {
  const trigger =
    def.trigger.type === "schedule"
      ? `schedule ${def.trigger.preset ?? "custom"} · ${def.trigger.cron} (${def.trigger.timezone})`
      : "manual";
  const preview = def.instructions.trim();
  const clipped =
    preview.length > 400 ? `${preview.slice(0, 400)}…` : preview || "(empty)";
  return [
    `Agent: ${def.name} (${def.status})`,
    def.description ? `Description: ${def.description}` : null,
    `Trigger: ${trigger}`,
    def.nextRunAt ? `Next run: ${def.nextRunAt}` : null,
    `Runtime messages: ${def.messageCount}`,
    `Instructions:\n${clipped}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateAgentDefinition(def: AgentDefinition): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!def.name.trim()) issues.push("Name is required.");
  if (!def.instructions.trim()) {
    issues.push("Instructions markdown is required.");
  }
  return { ok: issues.length === 0, issues };
}
