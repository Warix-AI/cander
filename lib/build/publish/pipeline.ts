/**
 * Publish pipeline primitives (server-only):
 *   - exclusive per-project publish lock (independent of SHA)
 *   - deployment lifecycle ledger (deployment_events)
 *   - blocking post-deploy health check
 *   - rollback to the previous READY production deployment
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vercelFetch } from "@/lib/build/vercel/api";
import type { DeploymentState } from "@/lib/build/records";

const LOCK_TTL_SEC = 15 * 60;

export async function acquirePublishLock(opts: { projectId: string; holder: string; attemptId: string }): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("acquire_publish_lock", {
    p_project_id: opts.projectId,
    p_holder: opts.holder,
    p_attempt_id: opts.attemptId,
    p_ttl_seconds: LOCK_TTL_SEC,
  });
  if (error) {
    // Fail closed: a publish without the lock could race another publish.
    console.warn("[cander:publish] lock rpc failed", error.message);
    return false;
  }
  return Boolean(data);
}

/** Same holder re-acquiring extends the TTL — use as heartbeat. */
export const heartbeatPublishLock = acquirePublishLock;

export async function releasePublishLock(opts: { projectId: string; holder: string }): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .rpc("release_publish_lock", { p_project_id: opts.projectId, p_holder: opts.holder })
    .then(() => undefined, () => undefined);
}

export async function recordDeploymentEvent(opts: {
  projectId: string;
  workspaceId: string;
  state: DeploymentState;
  publishAttemptId?: string | null;
  vercelDeploymentId?: string | null;
  commitSha?: string | null;
  url?: string | null;
  failureReason?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("deployment_events").insert({
    project_id: opts.projectId,
    workspace_id: opts.workspaceId,
    state: opts.state,
    publish_attempt_id: opts.publishAttemptId ?? null,
    vercel_deployment_id: opts.vercelDeploymentId ?? null,
    commit_sha: opts.commitSha ?? null,
    url: opts.url ?? null,
    failure_reason: opts.failureReason ? opts.failureReason.slice(0, 1000) : null,
    meta: opts.meta ?? {},
  });
  if (error) console.warn("[cander:publish] deployment event insert failed", error.message);
}

export type HealthCheckResult = { ok: boolean; checked: number; failures: Array<{ path: string; status: number }> };

/**
 * Blocking health check against the fresh deployment. `/` must answer 200 and
 * the sampled routes must not 5xx. Runs against the deployment's own URL so
 * it is independent of DNS / alias propagation.
 */
export async function healthCheckDeployment(opts: { baseUrl: string; routes?: string[]; timeoutMs?: number }): Promise<HealthCheckResult> {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const routes = ["/", ...(opts.routes ?? []).filter((r) => r && r !== "/" && !r.includes(":") && !r.includes("["))].slice(0, 8);
  const failures: Array<{ path: string; status: number }> = [];
  const probe = async (path: string): Promise<number> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${base}${path}`, {
          redirect: "follow",
          cache: "no-store",
          headers: { "User-Agent": "Cander-HealthCheck/1.0" },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        });
        if (res.status < 500) return res.status;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    return 0;
  };
  const statuses = await Promise.all(routes.map(async (path) => ({ path, status: await probe(path) })));
  for (const s of statuses) {
    if (s.path === "/" ? s.status !== 200 : s.status === 0 || s.status >= 500) failures.push(s);
  }
  return { ok: failures.length === 0, checked: routes.length, failures };
}

/**
 * Promote a previous READY production deployment back to production and move
 * the project's pointers. Never deletes anything.
 */
export async function rollbackToDeployment(opts: {
  projectId: string;
  workspaceId: string;
  vercelProjectId: string;
  deploymentId: string;
  sha: string | null;
  reason: string;
  publishAttemptId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const res = await vercelFetch(
    `/v10/projects/${encodeURIComponent(opts.vercelProjectId)}/promote/${encodeURIComponent(opts.deploymentId)}`,
    { method: "POST" },
  );
  if (!res.ok && res.status !== 201 && res.status !== 202) {
    const detail = await res.text().catch(() => "");
    await recordDeploymentEvent({
      ...opts,
      state: "failed",
      vercelDeploymentId: opts.deploymentId,
      commitSha: opts.sha,
      failureReason: `rollback promote failed: HTTP ${res.status} ${detail.slice(0, 200)}`,
      meta: { rollback: true },
    });
    return { ok: false, message: "Could not restore the previous version automatically." };
  }
  const admin = createSupabaseAdminClient();
  await admin
    .from("projects")
    .update({
      published_sha: opts.sha,
      vercel_production_deployment_id: opts.deploymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);
  await recordDeploymentEvent({
    ...opts,
    state: "rolled_back",
    vercelDeploymentId: opts.deploymentId,
    commitSha: opts.sha,
    meta: { reason: opts.reason },
  });
  return { ok: true, message: "Restored the previous live version." };
}
