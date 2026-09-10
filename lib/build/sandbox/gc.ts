/**
 * Sandbox garbage collection — stop idle build sandboxes and retire abandoned
 * ones. Invoked by /api/cron/sandbox-gc. Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BUILD_SANDBOX_IDLE_MS, BUILD_SANDBOX_PURPOSE, type BuildSandboxState } from "@/lib/build/sandbox/constants";
import { findActiveBuildJob } from "@/lib/build/jobs/store";
import { getComputerSessionById, updateComputerSession } from "@/lib/computer/session-store";
import { stopSessionRecordById } from "@/lib/computer/session-runtime";

type Row = {
  id: string;
  user_id: string;
  project_id: string | null;
  workspace_id: string | null;
  status: string;
  last_active_at: string | null;
  expires_at: string | null;
  build_state: BuildSandboxState | null;
};

export async function runSandboxGc(limit = 40): Promise<{
  scanned: number;
  stoppedIdle: string[];
  retired: string[];
  skippedActiveJob: string[];
  leasesCleared: number;
}> {
  const admin = createSupabaseAdminClient();
  const now = Date.now();
  const idleBefore = new Date(now - BUILD_SANDBOX_IDLE_MS).toISOString();

  const { data } = await admin
    .from("computer_sessions")
    .select("id, user_id, project_id, workspace_id, status, last_active_at, expires_at, build_state")
    .eq("provider", "vercel_sandbox")
    .in("status", ["active", "idle", "starting", "error"])
    .lt("last_active_at", idleBefore)
    .order("last_active_at", { ascending: true })
    .limit(limit);

  const rows = ((data ?? []) as Row[]).filter(
    (r) => r.build_state && r.build_state.purpose === BUILD_SANDBOX_PURPOSE,
  );

  const stoppedIdle: string[] = [];
  const retired: string[] = [];
  const skippedActiveJob: string[] = [];

  for (const row of rows) {
    try {
      if (row.project_id && row.workspace_id) {
        const job = await findActiveBuildJob({
          projectId: row.project_id,
          workspaceId: row.workspace_id,
        });
        if (job && job.facts.sessionId === row.id) {
          skippedActiveJob.push(row.id);
          continue;
        }
      }
      const expired = row.expires_at ? new Date(row.expires_at).getTime() < now : false;
      const persistent = Boolean(row.build_state?.persistent);
      const record = await getComputerSessionById(row.id, row.user_id);
      if (!record) continue;

      if (expired || !persistent || row.status === "error") {
        // Abandoned / disposable: retire fully and detach from the project.
        await stopSessionRecordById(row.id, row.user_id);
        if (row.project_id) {
          await admin
            .from("projects")
            .update({ sandbox_session_id: null, sandbox_status: "idle", updated_at: new Date().toISOString() })
            .eq("id", row.project_id)
            .eq("sandbox_session_id", row.id);
        }
        retired.push(row.id);
        continue;
      }

      // Idle persistent VM: stop the session (snapshot kept), keep the record
      // and the project pointer so the next open resumes the same VM.
      try {
        const { resumeSandbox, evictSandboxCache } = await import("@/lib/computer/session-runtime");
        const sandbox = await resumeSandbox(record);
        await sandbox.stop();
        evictSandboxCache(row.id);
      } catch (err) {
        console.warn("[cander:sandbox-gc] stop idle failed", row.id, err instanceof Error ? err.message : err);
      }
      await updateComputerSession(row.id, {
        status: "idle",
        stream_url: null,
        build_state: {
          ...(row.build_state as BuildSandboxState),
          status: "idle",
          previewUpstream: null,
          message: "Paused while idle",
          updatedAt: new Date().toISOString(),
        },
        // Do not count this write as activity.
        last_active_at: row.last_active_at ?? new Date().toISOString(),
      });
      if (row.project_id) {
        await admin
          .from("projects")
          .update({ sandbox_status: "idle", updated_at: new Date().toISOString() })
          .eq("id", row.project_id)
          .eq("sandbox_session_id", row.id);
      }
      stoppedIdle.push(row.id);
    } catch (err) {
      console.warn("[cander:sandbox-gc] row failed", row.id, err instanceof Error ? err.message : err);
    }
  }

  const { data: leases } = await admin
    .from("sandbox_leases")
    .delete()
    .lt("expires_at", new Date(now - 60_000).toISOString())
    .select("project_id");

  return {
    scanned: rows.length,
    stoppedIdle,
    retired,
    skippedActiveJob,
    leasesCleared: leases?.length ?? 0,
  };
}
