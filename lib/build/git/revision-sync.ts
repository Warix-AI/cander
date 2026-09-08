/**
 * Keep projects.draft_sha and project_revisions.draft_tip aligned to git SHAs.
 * Server-only (admin client).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { gitStoragePointer } from "@/lib/build/git/revision-pointers";

/**
 * Upsert draft_tip storage_pointer = git:{sha} and mirror projects.draft_sha.
 */
export async function syncProjectDraftTipToSha(opts: {
  projectId: string;
  workspaceId: string;
  draftSha: string;
  draftBranch?: string;
}): Promise<void> {
  const draftSha = opts.draftSha.trim().toLowerCase();
  const pointer = gitStoragePointer(draftSha);
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const projectPatch: Record<string, string> = {
    draft_sha: draftSha,
    updated_at: now,
  };
  if (opts.draftBranch) {
    projectPatch.draft_branch = opts.draftBranch;
  }

  await admin
    .from("projects")
    .update(projectPatch)
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);

  const { data: tip } = await admin
    .from("project_revisions")
    .select("id")
    .eq("project_id", opts.projectId)
    .eq("kind", "draft_tip")
    .maybeSingle();

  if (tip?.id) {
    await admin
      .from("project_revisions")
      .update({ storage_pointer: pointer })
      .eq("id", tip.id);
    await admin
      .from("projects")
      .update({ draft_revision_id: tip.id, updated_at: now })
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
    return;
  }

  const { data: created } = await admin
    .from("project_revisions")
    .insert({
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      kind: "draft_tip",
      storage_pointer: pointer,
    })
    .select("id")
    .single();

  if (created?.id) {
    await admin
      .from("projects")
      .update({ draft_revision_id: created.id, updated_at: now })
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
  }
}

/**
 * Record a candidate revision + change set keyed by git SHA (post-persist).
 */
export async function recordGitCandidateChangeSet(opts: {
  projectId: string;
  workspaceId: string;
  draftSha: string;
  summary: string;
  workerRunId?: string | null;
}): Promise<string | null> {
  const draftSha = opts.draftSha.trim().toLowerCase();
  if (!draftSha) return null;
  const pointer = gitStoragePointer(draftSha);
  const admin = createSupabaseAdminClient();

  const { data: tip } = await admin
    .from("project_revisions")
    .select("id")
    .eq("project_id", opts.projectId)
    .eq("kind", "draft_tip")
    .maybeSingle();
  const baseId = tip?.id ? String(tip.id) : null;

  const { data: cand } = await admin
    .from("project_revisions")
    .insert({
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      kind: "candidate",
      parent_revision_id: baseId,
      storage_pointer: pointer,
    })
    .select("id")
    .single();
  const candidateId = cand?.id ? String(cand.id) : null;

  const { data: changeSet, error } = await admin
    .from("project_change_sets")
    .insert({
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      base_revision_id: baseId,
      candidate_revision_id: candidateId,
      status: "pending_review",
      summary: `${opts.summary} (${draftSha.slice(0, 7)})`.slice(0, 500),
      worker_run_id: opts.workerRunId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[cander] git change set create failed", error.message);
    return null;
  }
  return changeSet?.id ? String(changeSet.id) : null;
}
