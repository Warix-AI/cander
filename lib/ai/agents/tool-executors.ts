/**
 * Agent builder tool executors — mutate via applyAgentConfigPatchClient.
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
} from "@/lib/agents/client";
import {
  bundleToAgentDefinition,
  formatAgentDefinitionSummary,
  validateAgentDefinition,
} from "@/lib/agents/definition";
import {
  mutationAddStep,
  mutationAttachKnowledge,
  mutationAttachSkill,
  mutationDeleteStep,
  mutationGrantTools,
  mutationRemoveKnowledge,
  mutationRemoveSkill,
  mutationRevokeTools,
  mutationSetStepEnabled,
  mutationUpdateMetadata,
  mutationUpdateStep,
} from "@/lib/agents/mutations";
import type { AddStepKind } from "@/components/agents/builder/workflow-model";
import { labelForAgentTool } from "@/lib/ai/agents/labels";

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
        data: { agentId: def.id, stepCount: def.steps.length },
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
      const mutation = mutationUpdateMetadata({
        name: args.name != null ? String(args.name) : undefined,
        description:
          args.description != null ? String(args.description) : undefined,
        instructions:
          args.instructions != null ? String(args.instructions) : undefined,
        enabled:
          typeof args.enabled === "boolean" ? args.enabled : undefined,
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
        output: mutation.summary,
        data: { agentId: bundle.agent.id, name: bundle.agent.name },
      };
    }

    const load = () =>
      loadAgentBundleClient({ workspaceId, projectId, agentId, force: true });

    if (name === "agent.step.add") {
      const kind = String(args.kind || "action") as AddStepKind;
      const allowed: AddStepKind[] = [
        "trigger",
        "condition",
        "action",
        "wait",
        "branch",
      ];
      if (!allowed.includes(kind)) {
        return {
          name,
          ok: false,
          output: `Unknown step kind: ${kind}. Use trigger, condition, action, wait, or branch.`,
        };
      }
      const bundle = await load();
      const mutation = mutationAddStep({
        routes: bundle.routes,
        kind,
        afterStepId:
          typeof args.afterStepId === "string" ? args.afterStepId : null,
      });
      const next = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      const label =
        typeof args.label === "string" && args.label.trim()
          ? args.label.trim()
          : null;
      if (label && mutation.patch.upsertRoutes?.[0]) {
        // Best-effort: if model provided a label, apply a follow-up update on newest incomplete step
        const { routesToSteps } = await import(
          "@/components/agents/builder/workflow-model"
        );
        const steps = routesToSteps(next.routes);
        const target =
          steps.find((s) => s.type === kind && s.status === "incomplete") ??
          steps.filter((s) => s.type === kind).at(-1);
        if (target) {
          const updated = mutationUpdateStep({
            routes: next.routes,
            stepId: target.id,
            label,
            type: typeof args.type === "string" ? args.type : undefined,
            config:
              args.config && typeof args.config === "object"
                ? (args.config as Record<string, unknown>)
                : undefined,
          });
          if (!("error" in updated)) {
            const finalBundle = await applyAgentConfigPatchClient({
              workspaceId,
              projectId,
              agentId,
              patch: updated.patch,
              confirmed: true,
            });
            return {
              name,
              ok: true,
              output: `${mutation.summary} · ${label}`,
              data: {
                agentId,
                stepId: target.id,
                routes: finalBundle.routes.length,
              },
            };
          }
        }
      }
      return {
        name,
        ok: true,
        output: mutation.summary,
        data: { agentId, routes: next.routes.length },
      };
    }

    if (name === "agent.step.update") {
      const stepId = String(args.stepId ?? "").trim();
      if (!stepId) {
        return { name, ok: false, output: "stepId is required." };
      }
      const bundle = await load();
      const mutation = mutationUpdateStep({
        routes: bundle.routes,
        stepId,
        label: args.label != null ? String(args.label) : undefined,
        type: args.type != null ? String(args.type) : undefined,
        expression:
          args.expression != null ? String(args.expression) : undefined,
        config:
          args.config && typeof args.config === "object"
            ? (args.config as Record<string, unknown>)
            : undefined,
      });
      if ("error" in mutation) {
        return { name, ok: false, output: mutation.error };
      }
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary, data: { stepId } };
    }

    if (name === "agent.step.delete") {
      const stepId = String(args.stepId ?? "").trim();
      if (!stepId) {
        return { name, ok: false, output: "stepId is required." };
      }
      const bundle = await load();
      const mutation = mutationDeleteStep({ routes: bundle.routes, stepId });
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary, data: { stepId } };
    }

    if (name === "agent.step.set_enabled") {
      const stepId = String(args.stepId ?? "").trim();
      if (!stepId) {
        return { name, ok: false, output: "stepId is required." };
      }
      const enabled = Boolean(args.enabled);
      const bundle = await load();
      const mutation = mutationSetStepEnabled({
        routes: bundle.routes,
        stepId,
        enabled,
      });
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary, data: { stepId } };
    }

    if (name === "agent.tools.grant") {
      const connectionId = String(args.connectionId ?? "").trim();
      const connectorId = String(args.connectorId ?? "").trim();
      const toolIds = Array.isArray(args.toolIds)
        ? args.toolIds.map(String)
        : typeof args.toolId === "string"
          ? [args.toolId]
          : [];
      if (!connectionId || !connectorId || !toolIds.length) {
        return {
          name,
          ok: false,
          output:
            "connectionId, connectorId, and toolIds[] are required to grant tools.",
        };
      }
      const mutation = mutationGrantTools({
        connectionId,
        connectorId,
        toolIds,
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

    if (name === "agent.tools.revoke") {
      const connectionId = String(args.connectionId ?? "").trim();
      const connectorId = String(args.connectorId ?? "").trim();
      const toolIds = Array.isArray(args.toolIds)
        ? args.toolIds.map(String)
        : typeof args.toolId === "string"
          ? [args.toolId]
          : [];
      if (!connectionId || !connectorId || !toolIds.length) {
        return {
          name,
          ok: false,
          output: "connectionId, connectorId, and toolIds[] are required.",
        };
      }
      const mutation = mutationRevokeTools({
        connectionId,
        connectorId,
        toolIds,
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

    if (name === "agent.skill.attach") {
      const skillLabel = String(args.skillLabel || args.label || "").trim();
      if (!skillLabel) {
        return { name, ok: false, output: "skillLabel is required." };
      }
      const skillId =
        String(args.skillId || "").trim() ||
        `skill_${skillLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      const mutation = mutationAttachSkill({ skillId, skillLabel });
      await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch: mutation.patch,
        confirmed: true,
      });
      return { name, ok: true, output: mutation.summary };
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

    if (name === "agent.knowledge.attach") {
      const sourceId = String(args.sourceId ?? "").trim();
      const sourceLabel = String(args.sourceLabel || sourceId).trim();
      const sourceKindRaw = String(args.sourceKind || "knowledge_base");
      const sourceKind =
        sourceKindRaw === "file" || sourceKindRaw === "project_resource"
          ? sourceKindRaw
          : "knowledge_base";
      if (!sourceId) {
        return { name, ok: false, output: "sourceId is required." };
      }
      const mutation = mutationAttachKnowledge({
        sourceKind,
        sourceId,
        sourceLabel,
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

    return {
      name,
      ok: false,
      output: `Unknown agent tool: ${name} (${labelForAgentTool(name)})`,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      output:
        err instanceof Error
          ? err.message
          : "Agent builder tool failed.",
    };
  }
}
