/**
 * Expert directory tools for Cander — Name + Description + Status only.
 * Uses HTTP APIs so this module stays client-safe (no admin/runtime imports).
 */

import type { AiToolCallResult } from "@/lib/ai/runtime/tools";
import {
  getTurnProjectId,
  getTurnWorkspaceId,
} from "@/lib/ai/runtime/turn-context";
import {
  assertNoInstructionsLeak,
  formatExpertDirectoryForPrompt,
} from "@/lib/agents/directory-search";
import {
  consultExpertClient,
  listExpertDirectoryClient,
} from "@/lib/agents/client";

export { assertNoInstructionsLeak };

export async function executeExpertDirectoryTool(input: {
  name: string;
  arguments: Record<string, unknown>;
}): Promise<AiToolCallResult> {
  const { name, arguments: args } = input;
  const workspaceId =
    getTurnWorkspaceId() ||
    (typeof args.workspaceId === "string" ? args.workspaceId.trim() : "");
  const projectId =
    getTurnProjectId() ||
    (typeof args.projectId === "string" ? args.projectId.trim() : "") ||
    null;

  if (!workspaceId) {
    return {
      name,
      ok: false,
      output: "workspaceId is required to look up Experts.",
    };
  }

  try {
    if (name === "experts.list" || name === "list_experts") {
      const listed = await listExpertDirectoryClient({
        workspaceId,
        projectId: projectId || undefined,
      });
      if (!assertNoInstructionsLeak(listed.experts)) {
        return { name, ok: false, output: "Expert directory leaked Instructions." };
      }
      return {
        name,
        ok: true,
        output: listed.summary || formatExpertDirectoryForPrompt(listed.experts),
        data: { experts: listed.experts },
      };
    }

    if (name === "experts.search" || name === "search_experts") {
      const query =
        typeof args.query === "string"
          ? args.query
          : typeof args.situation === "string"
            ? args.situation
            : "";
      const listed = await listExpertDirectoryClient({
        workspaceId,
        projectId: projectId || undefined,
        query,
      });
      if (!assertNoInstructionsLeak(listed.experts)) {
        return { name, ok: false, output: "Expert directory leaked Instructions." };
      }
      return {
        name,
        ok: true,
        output: listed.experts.length
          ? listed.summary || formatExpertDirectoryForPrompt(listed.experts)
          : "No Experts matched. You may handle this without consulting an Expert.",
        data: { experts: listed.experts },
      };
    }

    if (name === "experts.consult" || name === "consult_expert") {
      const expertId =
        (typeof args.expertId === "string" && args.expertId.trim()) ||
        (typeof args.agentId === "string" && args.agentId.trim()) ||
        "";
      const situation =
        typeof args.situation === "string" ? args.situation.trim() : "";
      if (!expertId || !situation) {
        return {
          name,
          ok: false,
          output: "expertId and situation are required.",
        };
      }

      const result = await consultExpertClient({
        workspaceId,
        expertId,
        situation,
      });

      return {
        name,
        ok:
          result.run.status === "completed" ||
          result.run.status === "waiting",
        output:
          result.run.summary ||
          result.run.error ||
          result.content ||
          "Consult finished.",
        data: {
          expertId,
          expertName: result.expert.name,
          runId: result.run.id,
          status: result.run.status,
        },
      };
    }

    return { name, ok: false, output: `Unknown experts tool: ${name}` };
  } catch (err) {
    return {
      name,
      ok: false,
      output: err instanceof Error ? err.message : "Experts tool failed.",
    };
  }
}

export async function executeExpertTool(input: {
  name: string;
  args?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
}): Promise<AiToolCallResult | null> {
  if (
    !input.name.startsWith("experts.") &&
    input.name !== "list_experts" &&
    input.name !== "search_experts" &&
    input.name !== "consult_expert"
  ) {
    return null;
  }
  return executeExpertDirectoryTool({
    name: input.name,
    arguments: input.arguments ?? input.args ?? {},
  });
}
