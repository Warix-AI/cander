/**
 * Publish auto-fix loop (server-only).
 *
 * When publish fails for a reason the agent can fix (preflight issues, a Vercel
 * build error), schedule one bounded repair build job with the sanitized
 * failure as its instruction. When that job reaches ready, the runner calls
 * publishProject again with fixAttempt+1. At most MAX_FIX_ATTEMPTS rounds; after
 * that the publish stays failed with a plain-English "needs your attention".
 */

import { createBuildJob, findActiveBuildJob, type BuildJob } from "@/lib/build/jobs/store";

export const MAX_FIX_ATTEMPTS = 2;

export type PublishFixFacts = {
  attempt: number;
  publishAttemptId: string;
  preferredUrl: string | null;
};

/** Strip secrets/paths that must not reach the model or the user. */
export function sanitizeBuildFailure(text: string): string {
  return text
    .replace(/(sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, "[redacted]")
    .replace(/\/vercel\/path\d+\//g, "")
    .replace(/https?:\/\/[^\s)]*vercel\.com[^\s)]*/g, "")
    .slice(0, 6000);
}

export async function schedulePublishFix(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  preferredUrl: string | null;
  publishAttemptId: string;
  fixAttempt: number;
  failure: string;
}): Promise<{ scheduled: boolean; jobId?: string; reason?: string }> {
  if (opts.fixAttempt >= MAX_FIX_ATTEMPTS) return { scheduled: false, reason: "max_attempts" };
  const active = await findActiveBuildJob({ projectId: opts.projectId, workspaceId: opts.workspaceId });
  if (active) return { scheduled: false, reason: "build_active" };

  const failure = sanitizeBuildFailure(opts.failure);
  const instruction = [
    "Publishing this site failed because the production build/verification reported the problems below. Fix them with the smallest correct change; do not redesign or add features. Make sure `next build` passes.",
    "",
    failure,
  ].join("\n");
  const publishFix: PublishFixFacts = {
    attempt: opts.fixAttempt + 1,
    publishAttemptId: opts.publishAttemptId,
    preferredUrl: opts.preferredUrl,
  };
  try {
    const job = await createBuildJob({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      mode: "edit",
      title: "Fix for publish",
      goal: "Repair the draft so it can be published",
      instruction,
      publishFix,
    });
    const { startBuildJob } = await import("@/lib/build/jobs/runner");
    // Await the start: this runs inside the publish `after()` and the function
    // is frozen the moment publish returns — a fire-and-forget start died
    // mid-flight and left the job at "Preparing your workspace" forever.
    // startBuildJob fails the job itself on error; a thrown error here means
    // it never got that far, so mark it failed so the UI can offer Retry.
    try {
      await startBuildJob(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[cander:publish-fix] start failed", message);
      const { markBuildJobStartFailed } = await import("@/lib/build/jobs/runner");
      await markBuildJobStartFailed(job.id, message).catch(() => undefined);
    }
    return { scheduled: true, jobId: job.id };
  } catch (err) {
    return { scheduled: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Called by the runner when a job reaches ready: republish if this was a fix job. */
export async function republishAfterFix(job: BuildJob): Promise<void> {
  const fix = job.facts.publishFix;
  if (!fix || !job.facts.userId) return;
  const { publishProject } = await import("@/lib/build/publish/publish-project");
  const result = await publishProject({
    userId: job.facts.userId,
    projectId: job.projectId,
    workspaceId: job.workspaceId,
    preferredUrl: fix.preferredUrl,
    fixAttempt: fix.attempt,
  });
  console.info("[cander:publish-fix] republish", { jobId: job.id, attempt: fix.attempt, ok: result.ok, status: result.status });
}
