/**
 * Keep projects.draft_sha and project_revisions.draft_tip aligned to git SHAs.
 * Server-only (admin client). Errors are returned — never swallowed silently.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { gitStoragePointer } from "@/lib/build/git/revision-pointers";

export type SyncDraftTipResult = {
  ok: boolean;
  draftSha: string;
  error?: string;
};

/**
 * Upsert draft_tip storage_pointer = git:{sha} and mirror projects.draft_sha.
 */
export async function syncProjectDraftTipToSha(opts: {
  projectId: string;
  workspaceId: string;
  draftSha: string;
  draftBranch?: string;
}): Promise<SyncDraftTipResult> {
  const draftSha = opts.draftSha.trim().toLowerCase();
  if (!draftSha) {
    return { ok: false, draftSha: "", error: "Empty draft SHA." };
  }
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

  const { error: projectErr } = await admin
    .from("projects")
    .update(projectPatch)
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);
  if (projectErr) {
    console.warn("[cander] draft_sha sync failed", projectErr.message);
    return { ok: false, draftSha, error: projectErr.message };
  }

  const { data: tip, error: tipSelectErr } = await admin
    .from("project_revisions")
    .select("id")
    .eq("project_id", opts.projectId)
    .eq("kind", "draft_tip")
    .maybeSingle();
  if (tipSelectErr) {
    console.warn("[cander] draft_tip select failed", tipSelectErr.message);
    return { ok: false, draftSha, error: tipSelectErr.message };
  }

  if (tip?.id) {
    const { error: tipUpErr } = await admin
      .from("project_revisions")
      .update({ storage_pointer: pointer })
      .eq("id", tip.id);
    if (tipUpErr) {
      return { ok: false, draftSha, error: tipUpErr.message };
    }
    const { error: linkErr } = await admin
      .from("projects")
      .update({ draft_revision_id: tip.id, updated_at: now })
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
    if (linkErr) {
      return { ok: false, draftSha, error: linkErr.message };
    }
    return { ok: true, draftSha };
  }

  const { data: created, error: createErr } = await admin
    .from("project_revisions")
    .insert({
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      kind: "draft_tip",
      storage_pointer: pointer,
    })
    .select("id")
    .single();
  if (createErr || !created?.id) {
    return {
      ok: false,
      draftSha,
      error: createErr?.message || "Could not create draft_tip revision.",
    };
  }

  const { error: linkErr } = await admin
    .from("projects")
    .update({ draft_revision_id: created.id, updated_at: now })
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);
  if (linkErr) {
    return { ok: false, draftSha, error: linkErr.message };
  }
  return { ok: true, draftSha };
}

/**
 * When GitHub tip advanced but DB pointer lagged, re-run sync.
 */
export async function reconcileDraftTipPointer(opts: {
  projectId: string;
  workspaceId: string;
  githubDraftSha: string;
  draftBranch?: string;
}): Promise<SyncDraftTipResult> {
  return syncProjectDraftTipToSha({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    draftSha: opts.githubDraftSha,
    draftBranch: opts.draftBranch,
  });
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
