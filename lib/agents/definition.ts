/**
 * Compact agent definition for AI tools and the builder UI.
 * Skills + scoped tools + trigger (no Zapier steps).
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
  trigger: ProjectAgentBundle["agent"]["trigger"];
  nextRunAt: string | null;
  skills: Array<{
    skillId: string;
    name: string;
    markdownPreview: string;
  }>;
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
  knowledge: Array<{
    id: string;
    sourceKind: string;
    sourceId: string;
    sourceLabel: string;
  }>;
  recentRuns: Array<{
    id: string;
    status: string;
    triggerType: string;
    startedAt: string;
    summary: string | null;
  }>;
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
    trigger: bundle.agent.trigger,
    nextRunAt: bundle.agent.nextRunAt,
    skills: bundle.skills.map((s) => {
      const md = s.skill?.markdown ?? "";
      return {
        skillId: s.skillId,
        name: s.skill?.name ?? s.skillLabel,
        markdownPreview:
          md.length > 280 ? `${md.slice(0, 280)}…` : md || "(empty skill)",
      };
    }),
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
    knowledge: bundle.knowledge.map((k) => ({
      id: k.id,
      sourceKind: k.sourceKind,
      sourceId: k.sourceId,
      sourceLabel: k.sourceLabel,
    })),
    recentRuns: (bundle.runs ?? []).slice(0, 5).map((r) => ({
      id: r.id,
      status: r.status,
      triggerType: r.triggerType,
      startedAt: r.startedAt,
      summary: r.summary,
    })),
  };
}

export function formatAgentDefinitionSummary(def: AgentDefinition): string {
  const lines: string[] = [
    `Agent: ${def.name} (${def.id})`,
    `Status: ${def.status} (executable when active)`,
  ];
  if (def.description.trim()) lines.push(`Description: ${def.description}`);

  if (def.trigger.type === "schedule") {
    lines.push(
      `Trigger: schedule cron=${def.trigger.cron} tz=${def.trigger.timezone}` +
        (def.nextRunAt ? ` next=${def.nextRunAt}` : ""),
    );
  } else {
    lines.push("Trigger: manual");
  }

  if (!def.skills.length) {
    lines.push("Skills: none — attach or create a skill that defines the job.");
  } else {
    lines.push("Skills:");
    for (const s of def.skills) {
      lines.push(`## ${s.name} (${s.skillId})`);
      lines.push(s.markdownPreview);
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
    lines.push(`Allowed tools: ${def.tools.map((t) => t.toolId).join(", ")}`);
  } else {
    lines.push("Allowed tools: none");
  }
  if (def.knowledge.length) {
    lines.push(
      `Knowledge: ${def.knowledge.map((k) => k.sourceLabel).join(", ")}`,
    );
  }
  if (def.recentRuns.length) {
    lines.push("Recent runs:");
    for (const r of def.recentRuns) {
      lines.push(
        `- ${r.startedAt} ${r.status} (${r.triggerType})${r.summary ? `: ${r.summary}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

export function validateAgentDefinition(def: AgentDefinition): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!def.name.trim()) issues.push("Agent needs a name.");
  if (!def.skills.length) {
    issues.push("Attach at least one skill that describes what the agent should do.");
  } else if (
    def.skills.every(
      (s) =>
        !s.markdownPreview.trim() ||
        s.markdownPreview === "(empty skill)",
    )
  ) {
    issues.push("Skills need markdown instructions.");
  }
  if (def.status === "active" && !def.tools.length) {
    issues.push(
      "Active agent has no allowed tools — grant connector tools under Access.",
    );
  }
  return { ok: issues.length === 0, issues };
}
