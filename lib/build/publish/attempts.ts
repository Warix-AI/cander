/**
 * Durable publish_attempts store (DB lock + idempotency).
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PublishAttemptStatus =
  | "pending"
  | "preflight"
  | "deploying"
  | "published"
  | "failed"
  | "git_sync_repair";

export type PublishAttemptRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  publish_attempt_id: string;
  idempotency_key: string;
  draft_sha: string;
  promoted_main_sha: string | null;
  vercel_project_id: string | null;
  vercel_deployment_id: string | null;
  status: PublishAttemptStatus;
  error: string | null;
  published_url: string | null;
  git_sync_error: string | null;
  meta: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
};

export function publishIdempotencyKey(
  projectId: string,
  draftSha: string,
): string {
  return `publish:${projectId}:${draftSha.toLowerCase()}`;
}

export async function findPublishAttemptByKey(
  idempotencyKey: string,
): Promise<PublishAttemptRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("publish_attempts")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as PublishAttemptRow;
}

export async function findSuccessfulPublishForSha(opts: {
  projectId: string;
  draftSha: string;
}): Promise<PublishAttemptRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("publish_attempts")
    .select("*")
    .eq("project_id", opts.projectId)
    .eq("draft_sha", opts.draftSha.toLowerCase())
    .in("status", ["published", "git_sync_repair"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as PublishAttemptRow;
}

/**
 * Insert a pending attempt. On unique conflict:
 * - success / in-flight → return existing (idempotent)
 * - failed → reclaim row for a new attempt
 */
export async function beginPublishAttempt(opts: {
  workspaceId: string;
  projectId: string;
  publishAttemptId: string;
  draftSha: string;
  meta?: Record<string, unknown>;
}): Promise<{ attempt: PublishAttemptRow; created: boolean }> {
  const admin = createSupabaseAdminClient();
  const draftSha = opts.draftSha.toLowerCase();
  const idempotencyKey = publishIdempotencyKey(opts.projectId, draftSha);
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("publish_attempts")
    .insert({
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      publish_attempt_id: opts.publishAttemptId,
      idempotency_key: idempotencyKey,
      draft_sha: draftSha,
      status: "pending",
      meta: opts.meta ?? {},
      started_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (!error && data) {
    return { attempt: data as PublishAttemptRow, created: true };
  }

  const existing =
    (await findPublishAttemptByKey(idempotencyKey)) ||
    (await findSuccessfulPublishForSha({
      projectId: opts.projectId,
      draftSha,
    }));

  if (existing?.status === "failed") {
    const { data: reclaimed, error: reclaimError } = await admin
      .from("publish_attempts")
      .update({
        publish_attempt_id: opts.publishAttemptId,
        status: "pending",
        error: null,
        vercel_deployment_id: null,
        published_url: null,
        git_sync_error: null,
        promoted_main_sha: null,
        completed_at: null,
        meta: opts.meta ?? {},
        started_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("status", "failed")
      .select("*")
      .maybeSingle();
    if (!reclaimError && reclaimed) {
      return { attempt: reclaimed as PublishAttemptRow, created: true };
    }
  }

  if (existing) {
    return { attempt: existing, created: false };
  }

  throw new Error(
    error?.message ||
      "Could not create or load publish_attempts row (is migration 067 applied?)",
  );
}

export async function updatePublishAttempt(opts: {
  publishAttemptId: string;
  projectId: string;
  patch: Partial<{
    status: PublishAttemptStatus;
    draft_sha: string;
    promoted_main_sha: string | null;
    vercel_project_id: string | null;
    vercel_deployment_id: string | null;
    error: string | null;
    published_url: string | null;
    git_sync_error: string | null;
    meta: Record<string, unknown>;
    completed_at: string | null;
  }>;
}): Promise<PublishAttemptRow | null> {
  const admin = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {
    ...opts.patch,
    updated_at: new Date().toISOString(),
  };
  if (opts.patch.draft_sha) {
    const sha = opts.patch.draft_sha.toLowerCase();
    patch.draft_sha = sha;
    patch.idempotency_key = publishIdempotencyKey(opts.projectId, sha);
  }
  const { data, error } = await admin
    .from("publish_attempts")
    .update(patch)
    .eq("publish_attempt_id", opts.publishAttemptId)
    .select("*")
    .maybeSingle();
  if (error) {
    console.warn("[cander:publish] updatePublishAttempt", error.message);
    return null;
  }
  return (data as PublishAttemptRow) ?? null;
}
