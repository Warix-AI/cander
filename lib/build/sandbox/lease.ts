/**
 * Cross-instance lease for a project's sandbox lifecycle.
 * Serializes ensure / repair / reset across serverless instances so a project
 * never ends up with two VMs racing each other. Server-only.
 */

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DEFAULT_TTL_SEC = 4 * 60;
const POLL_MS = 750;

export type LeaseHandle = { projectId: string; holder: string; release: () => Promise<void> };

const RPC_RETRIES = 3;

/**
 * Fail closed: if the lease RPC itself errors (network, DB blip) we retry with
 * backoff and then report "not acquired" — two instances racing to create
 * VMs for one project is worse than a delayed preview.
 */
async function tryAcquire(projectId: string, holder: string, ttlSec: number): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  for (let attempt = 0; attempt < RPC_RETRIES; attempt++) {
    const { data, error } = await admin.rpc("acquire_sandbox_lease", {
      p_project_id: projectId,
      p_holder: holder,
      p_ttl_seconds: ttlSec,
    });
    if (!error) return Boolean(data);
    console.warn("[cander:sandbox] lease rpc failed", { attempt, message: error.message });
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  return false;
}

/**
 * Acquire the project lease, waiting up to `waitMs`. Returns null when the
 * lease is still held by someone else after the wait — callers should then
 * report the current status instead of doing lifecycle work.
 */
export async function acquireProjectSandboxLease(opts: {
  projectId: string;
  waitMs?: number;
  ttlSec?: number;
}): Promise<LeaseHandle | null> {
  const holder = randomUUID();
  const ttlSec = opts.ttlSec ?? DEFAULT_TTL_SEC;
  const deadline = Date.now() + (opts.waitMs ?? 120_000);
  for (;;) {
    if (await tryAcquire(opts.projectId, holder, ttlSec)) {
      return {
        projectId: opts.projectId,
        holder,
        release: async () => {
          const admin = createSupabaseAdminClient();
          await admin
            .rpc("release_sandbox_lease", { p_project_id: opts.projectId, p_holder: holder })
            .then(() => undefined, () => undefined);
        },
      };
    }
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export async function withProjectSandboxLease<T>(
  opts: { projectId: string; waitMs?: number; ttlSec?: number },
  fn: (lease: LeaseHandle) => Promise<T>,
  onBusy: () => Promise<T>,
): Promise<T> {
  const lease = await acquireProjectSandboxLease(opts);
  if (!lease) return onBusy();
  try {
    return await fn(lease);
  } finally {
    await lease.release();
  }
}
