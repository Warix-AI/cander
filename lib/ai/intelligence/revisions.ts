/**
 * Draft vs Published revision helpers.
 * Immutable revisions; Sandbox snapshots are never SoT.
 */

import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ProjectRevisionKind = "draft_tip" | "candidate" | "published";

export type ProjectRevision = {
  id: string;
  projectId: string;
  workspaceId?: string | null;
  kind: ProjectRevisionKind;
  parentRevisionId?: string | null;
  storagePointer?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

function mapRevision(row: Record<string, unknown>): ProjectRevision {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    kind: row.kind as ProjectRevisionKind,
    parentRevisionId: row.parent_revision_id
      ? String(row.parent_revision_id)
      : null,
    storagePointer: row.storage_pointer ? String(row.storage_pointer) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Seed a draft tip when a project is created (idempotent). */
export async function ensureDraftRevision(opts: {
  projectId: string;
  workspaceId: string;
  actorId?: string | null;
}): Promise<ProjectRevision | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: existing } = await supabase
      .from("project_revisions")
      .select("*")
      .eq("project_id", opts.projectId)
      .eq("kind", "draft_tip")
      .maybeSingle();
    if (existing) return mapRevision(existing as Record<string, unknown>);

    const { data, error } = await supabase
      .from("project_revisions")
      .insert({
        project_id: opts.projectId,
        workspace_id: opts.workspaceId,
        kind: "draft_tip",
        created_by: opts.actorId ?? null,
        storage_pointer: `draft://${opts.projectId}`,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.warn("[cander] draft revision seed failed", error?.message);
      return null;
    }
    const rev = mapRevision(data as Record<string, unknown>);
    await supabase
      .from("projects")
      .update({
        draft_revision_id: rev.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.projectId);
    return rev;
  } catch (err) {
    console.warn("[cander] ensureDraftRevision", err);
    return null;
  }
}

export async function createCandidateChangeSet(opts: {
  projectId: string;
  workspaceId: string;
  baseRevisionId?: string | null;
  summary: string;
  workerRunId?: string | null;
}): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const workspaceId = opts.workspaceId?.trim();
  if (!workspaceId) {
    console.warn("[cander] change set requires workspaceId");
    return null;
  }
  try {
    const supabase = createSupabaseBrowserClient();
    let baseId = opts.baseRevisionId;
    if (!baseId) {
      const { data: tip } = await supabase
        .from("project_revisions")
        .select("id")
        .eq("project_id", opts.projectId)
        .eq("kind", "draft_tip")
        .maybeSingle();
      baseId = tip?.id ? String(tip.id) : null;
    }
    const { data: cand } = await supabase
      .from("project_revisions")
      .insert({
        project_id: opts.projectId,
        workspace_id: workspaceId,
        kind: "candidate",
        parent_revision_id: baseId,
        storage_pointer: `candidate://${opts.projectId}/${Date.now()}`,
      })
      .select("id")
      .single();
    const candidateId = cand?.id ? String(cand.id) : null;
    const { data, error } = await supabase
      .from("project_change_sets")
      .insert({
        project_id: opts.projectId,
        workspace_id: workspaceId,
        base_revision_id: baseId,
        candidate_revision_id: candidateId,
        status: "pending_review",
        summary: opts.summary,
        worker_run_id: opts.workerRunId ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[cander] change set create failed", error.message);
      return null;
    }
    return data?.id ? String(data.id) : null;
  } catch (err) {
    console.warn("[cander] createCandidateChangeSet", err);
    return null;
  }
}

/**
 * Explicit publish: promote draft tip → new published revision.
 * Failure must not alter the current published pointer.
 */
export async function promoteDraftToPublished(opts: {
  projectId: string;
  workspaceId: string;
  actorId?: string | null;
  publishedUrl?: string | null;
}): Promise<{ ok: boolean; revisionId?: string; detail: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, detail: "Cloud is not configured." };
  }
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: tip } = await supabase
      .from("project_revisions")
      .select("*")
      .eq("project_id", opts.projectId)
      .eq("kind", "draft_tip")
      .maybeSingle();
    if (!tip) {
      await ensureDraftRevision({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        actorId: opts.actorId,
      });
    }
    const { data: tip2 } = await supabase
      .from("project_revisions")
      .select("*")
      .eq("project_id", opts.projectId)
      .eq("kind", "draft_tip")
      .maybeSingle();
    const parentId = tip2?.id ? String(tip2.id) : null;

    const { data: published, error } = await supabase
      .from("project_revisions")
      .insert({
        project_id: opts.projectId,
        workspace_id: opts.workspaceId,
        kind: "published",
        parent_revision_id: parentId,
        created_by: opts.actorId ?? null,
        storage_pointer:
          opts.publishedUrl || `published://${opts.projectId}/${Date.now()}`,
      })
      .select("*")
      .single();
    if (error || !published) {
      return {
        ok: false,
        detail: error?.message || "Could not create published revision.",
      };
    }
    const revId = String(published.id);
    const { error: upErr } = await supabase
      .from("projects")
      .update({
        status: "published",
        published_url: opts.publishedUrl ?? null,
        published_revision_id: revId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.projectId);
    if (upErr) {
      return {
        ok: false,
        detail: upErr.message || "Publish validation failed.",
      };
    }
    return { ok: true, revisionId: revId, detail: "Published." };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Publish failed.",
    };
  }
}
