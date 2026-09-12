/**
 * Lightweight Expert directory for Cander routing.
 * Returns Name + Description + Status only — never Instructions.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AgentStatus } from "@/lib/agents/types";
import { agentStatusFromRow } from "@/lib/agents/types";
import {
  formatExpertDirectoryForPrompt,
  scoreExpertDirectory,
  searchExpertDirectory,
  type ExpertDirectoryEntryLike,
} from "@/lib/agents/directory-search";

export type ExpertDirectoryEntry = ExpertDirectoryEntryLike & {
  status: AgentStatus;
};

export {
  formatExpertDirectoryForPrompt,
  scoreExpertDirectory,
  searchExpertDirectory,
  assertNoInstructionsLeak,
} from "@/lib/agents/directory-search";

function mapDirectoryRow(row: Record<string, unknown>): ExpertDirectoryEntry {
  const enabled = Boolean(row.enabled);
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    workspaceId: String(row.workspace_id),
    name: String(row.name ?? "Expert"),
    description: String(row.description ?? "").trim(),
    status: agentStatusFromRow(row.status, enabled),
  };
}

/** Active (and optionally draft) Experts — public routing metadata only. */
export async function listExpertDirectory(opts: {
  workspaceId: string;
  /** When set, only Experts for this automation project. */
  projectId?: string | null;
  includeDraft?: boolean;
}): Promise<ExpertDirectoryEntry[]> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("project_agents")
    .select("id, project_id, workspace_id, name, description, status, enabled")
    .eq("workspace_id", opts.workspaceId)
    .order("sort_order", { ascending: true });

  if (opts.projectId) {
    query = query.eq("project_id", opts.projectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => mapDirectoryRow(row as Record<string, unknown>))
    .filter((entry) => {
      if (entry.status === "paused") return false;
      if (entry.status === "draft") return Boolean(opts.includeDraft);
      return entry.status === "active";
    });
}
