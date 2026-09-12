/**
 * Agent builder tool executors — mutate Instructions + Schedule via shared patches.
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
  mutationSetInstructions,
  mutationUpdateMetadata,
} from "@/lib/agents/mutations";
import {
  buildScheduleTrigger,
  coerceSchedulePreset,
  type SchedulePreset,
} from "@/lib/agents/schedule";
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
    const agents = await listProjectAgentsClient({
      workspaceId,
      projectId,
      force: true,
    });
    agentId = agents[0]?.id ?? "";
  }
  if (!agentId) {
    return { error: "No agent found in this project." } as const;
  }

  return { workspaceId, projectId, agentId } as const;
}

export async function executeAgentBuilderTool(input: {
  name: string;
  arguments: Record<string, unknown>;
}): Promise<AiToolCallResult> {
  const { name, arguments: args } = input;
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
        data: { agentId: def.id },
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

    if (name === "agent.skill.create" || name === "agent.skill.update") {
      const markdown = String(args.markdown ?? "").trim();
      if (!markdown) {
        return {
          name,
          ok: false,
          output: "markdown is required for instructions.",
        };
      }
      const mutation = mutationSetInstructions({
        markdown,
        name: args.name != null ? String(args.name) : undefined,
      });
      const bundle = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return {
        name,
        ok: true,
        output: `Updated instructions for ${bundle.agent.name}`,
        data: { instructionsLength: bundle.agent.instructions.length },
      };
    }

    if (
      name === "agent.skill.attach" ||
      name === "agent.skill.remove" ||
      name === "agent.knowledge.attach" ||
      name === "agent.knowledge.remove"
    ) {
      return {
        name,
        ok: true,
        output:
          "Skipped — agents no longer use separate skills/knowledge grants. Put everything in Instructions.",
      };
    }

    if (name === "agent.tools.grant" || name === "agent.tools.revoke") {
      return {
        name,
        ok: true,
        output:
          "Skipped — agents do not own connector tools. Cander already has the user’s connectors; describe desired behavior in Instructions.",
      };
    }

    if (name === "agent.trigger.set") {
      const type = String(args.type ?? "manual");
      let trigger: AgentTrigger;
      if (type === "schedule") {
        const preset = coerceSchedulePreset(args.preset);
        trigger = buildScheduleTrigger({
          preset: preset as SchedulePreset,
          time: typeof args.time === "string" ? args.time : "09:00",
          timezone:
            typeof args.timezone === "string" && args.timezone.trim()
              ? args.timezone
              : Intl.DateTimeFormat().resolvedOptions().timeZone ||
                "America/Denver",
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
            ? `Scheduled · ${trigger.preset ?? "custom"} · ${trigger.cron} (${trigger.timezone})`
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

export async function executeAgentTool(input: {
  name: string;
  args?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
}): Promise<AiToolCallResult | null> {
  return executeAgentBuilderTool({
    name: input.name,
    arguments: input.arguments ?? input.args ?? {},
  });
}
