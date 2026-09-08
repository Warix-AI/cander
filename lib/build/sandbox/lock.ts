/**
 * Soft project build lock via ai_tasks (queued|running|verifying).
 * Server-only (service role).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ACTIVE = ["queued", "running", "verifying"] as const;

export async function findActiveBuildLock(opts: {
  projectId: string;
  workspaceId: string;
  /** Allow this task id to proceed (holder). */
  exceptTaskId?: string | null;
}): Promise<{ taskId: string; title: string } | null> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("ai_tasks")
    .select("id, title, status")
    .eq("project_id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .in("status", [...ACTIVE])
    .order("updated_at", { ascending: false })
    .limit(5);

  const { data, error } = await q;
  if (error || !data?.length) return null;

  for (const row of data) {
    const id = String(row.id);
    if (opts.exceptTaskId && id === opts.exceptTaskId) continue;
    return { taskId: id, title: String(row.title ?? "Work task") };
  }
  return null;
}

export async function assertNoConcurrentBuild(opts: {
  projectId: string;
  workspaceId: string;
  exceptTaskId?: string | null;
}): Promise<void> {
  const lock = await findActiveBuildLock(opts);
  // Current task is already "running" — exceptTaskId skips self.
  // If another task is active, block.
  if (lock) {
    throw new Error(
      `Another build is already in progress for this project (“${lock.title}”). Try again when it finishes.`,
    );
  }
}
