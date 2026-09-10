/**
 * Pure publish_attempts idempotency policy (Phase 6).
 * Safe for node:test — no Supabase / network.
 */

export type PublishAttemptStatusLite =
  | "pending"
  | "preflight"
  | "deploying"
  | "published"
  | "failed"
  | "git_sync_repair";

export function publishIdempotencyKey(
  projectId: string,
  draftSha: string,
): string {
  return `publish:${projectId}:${draftSha.toLowerCase()}`;
}

/**
 * On unique-key conflict for beginPublishAttempt:
 * - failed → reclaim (new attempt on same row)
 * - success / in-flight → reuse (created: false)
 * - missing → create (caller inserts)
 */
export function resolvePublishAttemptConflict(
  existingStatus: PublishAttemptStatusLite | null | undefined,
): "create" | "reclaim" | "reuse" {
  if (!existingStatus) return "create";
  if (existingStatus === "failed") return "reclaim";
  return "reuse";
}

/** Double-publish same SHA must not mint a second attempt when already published. */
export function shouldReuseExistingPublishAttempt(
  status: PublishAttemptStatusLite,
): boolean {
  return resolvePublishAttemptConflict(status) === "reuse";
}
