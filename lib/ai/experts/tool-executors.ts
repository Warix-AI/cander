/**
 * Expert directory tools for Cander — Name + Description + Status only.
 * Never returns Instructions.
 */

import type { AiToolCallResult } from "@/lib/ai/runtime/tools";
import {
  getTurnProjectId,
  getTurnWorkspaceId,
} from "@/lib/ai/runtime/turn-context";
import {
  formatExpertDirectoryForPrompt,
  listExpertDirectory,
  searchExpertDirectory,
} from "@/lib/agents/directory";
import { consultExpert } from "@/lib/agents/routing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertNoInstructionsLeak } from "@/lib/agents/directory-search";

export { assertNoInstructionsLeak };

function directoryPayload(
  entries: Awaited<ReturnType<typeof listExpertDirectory>>,
) {
  const data = entries.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    name: e.name,
    description: e.description,
    status: e.status,
  }));
  if (!assertNoInstructionsLeak(data)) {
    throw new Error("Expert directory leaked Instructions.");
  }
  return data;
}

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
      const entries = await listExpertDirectory({
        workspaceId,
        projectId: projectId || undefined,
        includeDraft: false,
      });
      const data = directoryPayload(entries);
      return {
        name,
        ok: true,
        output: formatExpertDirectoryForPrompt(entries),
        data: { experts: data },
      };
    }

    if (name === "experts.search" || name === "search_experts") {
      const query =
        typeof args.query === "string"
          ? args.query
          : typeof args.situation === "string"
            ? args.situation
            : "";
      const all = await listExpertDirectory({
        workspaceId,
        projectId: projectId || undefined,
        includeDraft: false,
      });
      const entries = searchExpertDirectory(all, query, 8);
      const data = directoryPayload(entries);
      return {
        name,
        ok: true,
        output: entries.length
          ? formatExpertDirectoryForPrompt(entries)
          : "No Experts matched. You may handle this without consulting an Expert.",
        data: { experts: data },
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

      const entries = await listExpertDirectory({
        workspaceId,
        includeDraft: true,
      });
      const expert = entries.find((e) => e.id === expertId);
      if (!expert) {
        return { name, ok: false, output: "Expert not found in directory." };
      }

      // Resolve acting profile from the Expert's project owner when turn lacks it.
      const admin = createSupabaseAdminClient();
      const { data: agentRow } = await admin
        .from("project_agents")
        .select("created_by, project_id")
        .eq("id", expertId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      const profileId = String(agentRow?.created_by ?? "").trim();
      if (!profileId) {
        return {
          name,
          ok: false,
          output: "Could not resolve profile for Expert consult.",
        };
      }

      const result = await consultExpert({
        agentId: expertId,
        workspaceId,
        projectId: expert.projectId || String(agentRow?.project_id ?? ""),
        profileId,
        situation,
        triggerType: "consult",
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
          expertName: expert.name,
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
