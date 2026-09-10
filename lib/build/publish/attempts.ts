/**
 * Durable publish_attempts store (DB lock + idempotency).
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  publishIdempotencyKey,
  type PublishAttemptStatusLite,
} from "@/lib/build/publish/attempt-policy";

export {
  publishIdempotencyKey,
  resolvePublishAttemptConflict,
} from "@/lib/build/publish/attempt-policy";

export type PublishAttemptStatus = PublishAttemptStatusLite;

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
  heartbeat_at?: string | null;
  updated_at?: string | null;
};

/** An in-flight attempt whose worker has not written for this long is dead. */
export const PUBLISH_ATTEMPT_STALE_MS = 10 * 60 * 1000;

export const IN_FLIGHT_PUBLISH_STATUSES: PublishAttemptStatus[] = [
  "pending",
  "preflight",
  "deploying",
];

export function isPublishAttemptStale(row: PublishAttemptRow, now = Date.now()): boolean {
  if (!IN_FLIGHT_PUBLISH_STATUSES.includes(row.status)) return false;
  const last = Date.parse(row.heartbeat_at || row.updated_at || row.started_at || "") || 0;
  return now - last > PUBLISH_ATTEMPT_STALE_MS;
}

export async function findLatestPublishAttempt(
  projectId: string,
): Promise<PublishAttemptRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("publish_attempts")
    .select("*")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as PublishAttemptRow;
}

export async function findPublishAttemptById(
  publishAttemptId: string,
): Promise<PublishAttemptRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("publish_attempts")
    .select("*")
    .eq("publish_attempt_id", publishAttemptId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PublishAttemptRow;
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
      heartbeat_at: now,
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

  // Reclaim failed rows, and in-flight rows whose worker stopped heartbeating
  // (function timeout / crash) — otherwise the project is locked forever.
  if (existing && (existing.status === "failed" || isPublishAttemptStale(existing))) {
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
        meta: {
          ...(opts.meta ?? {}),
          reclaimedFrom: existing.publish_attempt_id,
          reclaimedStatus: existing.status,
        },
        started_at: now,
        updated_at: now,
        heartbeat_at: now,
      })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .select("*")
      .maybeSingle();
    if (!reclaimError && reclaimed) {
      return { attempt: reclaimed as PublishAttemptRow, created: true };
    }
  }

  if (existing) {
    // In-flight or successful → idempotent reuse (see resolvePublishAttemptConflict).
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
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ...opts.patch,
    updated_at: now,
    heartbeat_at: now,
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

/** Cheap liveness write for long stages (deploy polling). */
export async function heartbeatPublishAttempt(publishAttemptId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("publish_attempts")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("publish_attempt_id", publishAttemptId)
    .then(() => undefined, () => undefined);
}
