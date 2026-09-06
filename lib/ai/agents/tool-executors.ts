/**
 * Agent builder tool executors — mutate Skills / Access / Trigger via shared patches.
 */

import type { AiToolCallResult } from "@/lib/ai/runtime/tools";
import {
  getTurnAgentId,
  getTurnProjectId,
  getTurnWorkspaceId,
} from "@/lib/ai/runtime/turn-context";
import {
  applyAgentConfigPatchClient,
  listProjectAgentsClient,
  loadAgentBundleClient,
  runAgentClient,
} from "@/lib/agents/client";
import {
  bundleToAgentDefinition,
  formatAgentDefinitionSummary,
  validateAgentDefinition,
} from "@/lib/agents/definition";
import {
  mutationAttachKnowledge,
  mutationGrantTools,
  mutationRemoveKnowledge,
  mutationRemoveSkill,
  mutationRevokeTools,
  mutationUpdateMetadata,
} from "@/lib/agents/mutations";
import { buildScheduleTrigger } from "@/lib/agents/schedule";
import type { AgentStatus, AgentTrigger } from "@/lib/agents/types";

async function resolveContext(args: Record<string, unknown>) {
  const workspaceId =
    getTurnWorkspaceId() ||
    (typeof args.workspaceId === "string" ? args.workspaceId : "");
  const projectId =
    getTurnProjectId() ||
    (typeof args.projectId === "string" ? args.projectId : "");
  let agentId =
    (typeof args.agentId === "string" ? args.agentId.trim() : "") ||
    getTurnAgentId() ||
    "";

  if (!workspaceId || !projectId) {
    return {
      error: "Open an Agent project chat so I know which agent to edit.",
    } as const;
  }

  if (!agentId) {
    const agents = await listProjectAgentsClient({ workspaceId, projectId });
    agentId = agents[0]?.id ?? "";
  }
  if (!agentId) {
    return { error: "No agent found in this project." } as const;
  }

  return { workspaceId, projectId, agentId } as const;
}

function toolIdsFromArgs(args: Record<string, unknown>): string[] {
  if (Array.isArray(args.toolIds)) {
    return args.toolIds.map(String).filter(Boolean);
  }
  if (typeof args.toolId === "string" && args.toolId.trim()) {
    return [args.toolId.trim()];
  }
  return [];
}

export async function executeAgentTool(opts: {
  name: string;
  args: Record<string, unknown>;
}): Promise<AiToolCallResult | null> {
  const { name, args } = opts;
  if (!name.startsWith("agent.")) return null;

  const ctx = await resolveContext(args);
  if ("error" in ctx) {
    return { name, ok: false, output: String(ctx.error) };
  }
  const { workspaceId, projectId, agentId } = ctx;

  try {
    if (name === "agent.get") {
      const bundle = await loadAgentBundleClient({
        workspaceId,
        projectId,
        agentId,
        force: true,
      });
      const def = bundleToAgentDefinition(bundle);
      return {
        name,
        ok: true,
        output: formatAgentDefinitionSummary(def),
        data: { agentId: def.id, skillCount: def.skills.length },
      };
    }

    if (name === "agent.validate") {
      const bundle = await loadAgentBundleClient({
        workspaceId,
        projectId,
        agentId,
        force: true,
      });
      const def = bundleToAgentDefinition(bundle);
      const result = validateAgentDefinition(def);
      return {
        name,
        ok: true,
        output: result.ok
          ? "Agent validated — no blocking issues."
          : `Validation issues:\n- ${result.issues.join("\n- ")}`,
        data: result,
      };
    }

    if (name === "agent.update_metadata") {
      const status =
        typeof args.status === "string" &&
        ["draft", "active", "paused"].includes(args.status)
          ? (args.status as AgentStatus)
          : undefined;
      const mutation = mutationUpdateMetadata({
        name: args.name != null ? String(args.name) : undefined,
        description:
          args.description != null ? String(args.description) : undefined,
        enabled:
          typeof args.enabled === "boolean" ? args.enabled : undefined,
      });
      const bundle = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: {
          ...mutation.patch,
          ...(status ? { status } : {}),
        },
        confirmed: true,
      });
      return {
        name,
        ok: true,
        output: mutation.summary,
        data: { agentId: bundle.agent.id, status: bundle.agent.status },
      };
    }

    if (name === "agent.skill.create") {
      const markdown = String(args.markdown ?? "").trim();
      if (!markdown) {
        return { name, ok: false, output: "markdown is required for a skill." };
      }
      const bundle = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: {
          createSkill: {
            name: String(args.name ?? "Skill").trim() || "Skill",
            description:
              args.description != null ? String(args.description) : "",
            markdown,
          },
          status: "active",
        },
        confirmed: true,
      });
      return {
        name,
        ok: true,
        output: `Created skill and attached to ${bundle.agent.name}`,
        data: { skills: bundle.skills.length },
      };
    }

    if (name === "agent.skill.update") {
      const skillId = String(args.skillId ?? "").trim();
      if (!skillId) {
        return { name, ok: false, output: "skillId is required." };
      }
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: {
          updateSkill: {
            skillId,
            name: args.name != null ? String(args.name) : undefined,
            description:
              args.description != null ? String(args.description) : undefined,
            markdown:
              args.markdown != null ? String(args.markdown) : undefined,
          },
        },
        confirmed: true,
      });
      return { name, ok: true, output: "Updated skill", data: { skillId } };
    }

    if (name === "agent.skill.attach") {
      const skillId = String(args.skillId ?? "").trim();
      if (!skillId) {
        return { name, ok: false, output: "skillId is required." };
      }
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: {
          addSkills: [
            {
              skillId,
              skillLabel:
                typeof args.skillLabel === "string"
                  ? args.skillLabel
                  : skillId,
            },
          ],
        },
        confirmed: true,
      });
      return { name, ok: true, output: "Attached skill", data: { skillId } };
    }

    if (name === "agent.skill.remove") {
      const skillId = String(args.skillId ?? "").trim();
      if (!skillId) {
        return { name, ok: false, output: "skillId is required." };
      }
      const mutation = mutationRemoveSkill({ skillId });
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary };
    }

    if (name === "agent.tools.grant" || name === "agent.tools.revoke") {
      const connectionId = String(args.connectionId ?? "").trim();
      const connectorId = String(args.connectorId ?? "").trim();
      const toolIds = toolIdsFromArgs(args);
      if (!connectionId || !connectorId || !toolIds.length) {
        return {
          name,
          ok: false,
          output: "connectionId, connectorId, and toolIds are required.",
        };
      }
      const mutation =
        name === "agent.tools.grant"
          ? mutationGrantTools({ connectionId, connectorId, toolIds })
          : mutationRevokeTools({ connectionId, connectorId, toolIds });
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary };
    }

    if (name === "agent.knowledge.attach") {
      const sourceId = String(args.sourceId ?? "").trim();
      if (!sourceId) {
        return { name, ok: false, output: "sourceId is required." };
      }
      const mutation = mutationAttachKnowledge({
        sourceId,
        sourceLabel:
          typeof args.sourceLabel === "string" ? args.sourceLabel : sourceId,
        sourceKind:
          args.sourceKind === "file" || args.sourceKind === "project_resource"
            ? args.sourceKind
            : "knowledge_base",
      });
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary };
    }

    if (name === "agent.knowledge.remove") {
      const knowledgeId = String(args.knowledgeId ?? "").trim();
      if (!knowledgeId) {
        return { name, ok: false, output: "knowledgeId is required." };
      }
      const mutation = mutationRemoveKnowledge({ knowledgeId });
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary };
    }

    if (name === "agent.trigger.set") {
      const type = String(args.type ?? "manual");
      let trigger: AgentTrigger;
      if (type === "schedule") {
        trigger = buildScheduleTrigger({
          preset:
            (String(args.preset || "weekday") as
              | "hourly"
              | "daily"
              | "weekday"
              | "weekly"
              | "custom") || "weekday",
          time: typeof args.time === "string" ? args.time : "09:00",
          timezone:
            typeof args.timezone === "string" && args.timezone.trim()
              ? args.timezone
              : "America/Denver",
          cron: typeof args.cron === "string" ? args.cron : undefined,
        });
      } else {
        trigger = { type: "manual" };
      }
      const bundle = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: { trigger, status: "active" },
        confirmed: true,
      });
      return {
        name,
        ok: true,
        output:
          trigger.type === "schedule"
            ? `Scheduled · ${trigger.cron} (${trigger.timezone})`
            : "Trigger set to manual",
        data: { trigger: bundle.agent.trigger },
      };
    }

    if (name === "agent.run") {
      const result = await runAgentClient({
        workspaceId,
        projectId,
        agentId,
        message:
          typeof args.message === "string" ? args.message : undefined,
      });
      return {
        name,
        ok: result.run.status === "completed",
        output:
          result.run.summary ||
          result.run.error ||
          result.content ||
          "Run finished.",
        data: { runId: result.run.id, status: result.run.status },
      };
    }

    return {
      name,
      ok: false,
      output: `Unknown agent tool: ${name}`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      output: err instanceof Error ? err.message : "Agent tool failed.",
    };
  }
}
