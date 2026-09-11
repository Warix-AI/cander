/**
 * Project archive + teardown. Server-only.
 *
 * Delete in the product = soft archive: the project disappears from lists,
 * its sandbox stops and its database pauses, but the repo, Vercel project and
 * live site are untouched so a mistaken delete is recoverable. After the
 * grace period the cron hard-tears-down every provider resource (recording a
 * per-provider result) and removes the row.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const TEARDOWN_GRACE_DAYS = 30;

export type ProviderResult = { ok: boolean; skipped?: boolean; detail?: string; at: string };
export type TeardownStatus = {
  phase: "archived" | "tearing_down" | "torn_down" | "failed";
  sandbox?: ProviderResult;
  supabase?: ProviderResult;
  vercel?: ProviderResult;
  github?: ProviderResult;
  updatedAt: string;
};

type ProjectRow = {
  id: string;
  workspace_id: string;
  archived_at: string | null;
  teardown_status: TeardownStatus | null;
  sandbox_session_id: string | null;
  supabase_project_ref: string | null;
  vercel_project_id: string | null;
  github_full_name: string | null;
  created_by?: string | null;
};

const SELECT = "id, workspace_id, archived_at, teardown_status, sandbox_session_id, supabase_project_ref, vercel_project_id, github_full_name";

function now() {
  return new Date().toISOString();
}

async function loadProject(projectId: string, workspaceId?: string): Promise<ProjectRow | null> {
  const admin = createSupabaseAdminClient();
  let q = admin.from("projects").select(SELECT).eq("id", projectId);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data } = await q.maybeSingle();
  return (data as ProjectRow | null) ?? null;
}

async function saveStatus(projectId: string, status: TeardownStatus, extra: Record<string, unknown> = {}) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("projects")
    .update({ teardown_status: status, ...extra })
    .eq("id", projectId);
}

async function stopSandbox(p: ProjectRow, userId: string | null): Promise<ProviderResult> {
  if (!p.sandbox_session_id) return { ok: true, skipped: true, at: now() };
  try {
    const { stopSessionRecordById } = await import("@/lib/computer/session-runtime");
    if (userId) await stopSessionRecordById(p.sandbox_session_id, userId);
    const admin = createSupabaseAdminClient();
    await admin.from("computer_sessions").update({ status: "stopped" }).eq("id", p.sandbox_session_id);
    return { ok: true, at: now() };
  } catch (err) {
    return { ok: false, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200), at: now() };
  }
}

async function supabaseAction(p: ProjectRow, action: "pause" | "restore" | "delete"): Promise<ProviderResult> {
  if (!p.supabase_project_ref) return { ok: true, skipped: true, at: now() };
  try {
    const { supabaseManagementConfigured, supabaseManagementFetch } = await import("@/lib/build/supabase/management");
    if (!supabaseManagementConfigured()) return { ok: false, detail: "management api not configured", at: now() };
    const ref = encodeURIComponent(p.supabase_project_ref);
    const res =
      action === "delete"
        ? await supabaseManagementFetch(`/v1/projects/${ref}`, { method: "DELETE" })
        : await supabaseManagementFetch(`/v1/projects/${ref}/${action}`, { method: "POST" });
    // 404 on delete/pause = already gone; treat as done.
    if (res.ok || res.status === 404) {
      const admin = createSupabaseAdminClient();
      await admin
        .from("project_backends")
        .update({ status: action === "delete" ? "not_created" : action === "pause" ? "paused" : "ready", updated_at: now() })
        .eq("project_id", p.id);
      return { ok: true, at: now() };
    }
    return { ok: false, detail: `HTTP ${res.status}`, at: now() };
  } catch (err) {
    return { ok: false, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200), at: now() };
  }
}

async function deleteVercelProject(p: ProjectRow): Promise<ProviderResult> {
  if (!p.vercel_project_id) return { ok: true, skipped: true, at: now() };
  try {
    const { vercelApiConfigured, vercelFetch } = await import("@/lib/build/vercel/api");
    if (!vercelApiConfigured()) return { ok: false, detail: "vercel api not configured", at: now() };
    const res = await vercelFetch(`/v9/projects/${encodeURIComponent(p.vercel_project_id)}`, { method: "DELETE" });
    if (res.ok || res.status === 404) return { ok: true, at: now() };
    return { ok: false, detail: `HTTP ${res.status}`, at: now() };
  } catch (err) {
    return { ok: false, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200), at: now() };
  }
}

async function retireGitHubRepo(p: ProjectRow): Promise<ProviderResult> {
  if (!p.github_full_name) return { ok: true, skipped: true, at: now() };
  const [owner, repo] = p.github_full_name.split("/");
  if (!owner || !repo) return { ok: true, skipped: true, at: now() };
  try {
    const { getInstallationOctokit } = await import("@/lib/build/git/github-app");
    const octokit = await getInstallationOctokit();
    if (!octokit) return { ok: false, detail: "github app not configured", at: now() };
    // Delete needs the "administration: write" permission; archive is the fallback.
    try {
      await octokit.request("DELETE /repos/{owner}/{repo}", { owner, repo });
      return { ok: true, detail: "deleted", at: now() };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 404) return { ok: true, detail: "already gone", at: now() };
      await octokit.request("PATCH /repos/{owner}/{repo}", { owner, repo, archived: true });
      return { ok: true, detail: "archived", at: now() };
    }
  } catch (err) {
    return { ok: false, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200), at: now() };
  }
}

/** Soft delete. Idempotent. */
export async function archiveProject(opts: { projectId: string; workspaceId: string; userId: string | null }) {
  const p = await loadProject(opts.projectId, opts.workspaceId);
  if (!p) return { ok: false as const, error: "Project not found." };
  const archivedAt = p.archived_at ?? now();
  const teardownAfter = new Date(Date.parse(archivedAt) + TEARDOWN_GRACE_DAYS * 86_400_000).toISOString();
  const status: TeardownStatus = { ...(p.teardown_status ?? {}), phase: "archived", updatedAt: now() };
  await saveStatus(p.id, status, { archived_at: archivedAt, teardown_after: teardownAfter, sandbox_status: "stopped" });

  // Cheap, reversible provider actions right away.
  status.sandbox = await stopSandbox(p, opts.userId);
  status.supabase = await supabaseAction(p, "pause");
  status.updatedAt = now();
  await saveStatus(p.id, status);
  return { ok: true as const, archivedAt, teardownAfter, status };
}

/** Undo an archive within the grace period. */
export async function restoreProject(opts: { projectId: string; workspaceId: string }) {
  const p = await loadProject(opts.projectId, opts.workspaceId);
  if (!p) return { ok: false as const, error: "Project not found." };
  if (!p.archived_at) return { ok: true as const, restored: false };
  if (p.teardown_status?.phase === "tearing_down" || p.teardown_status?.phase === "torn_down") {
    return { ok: false as const, error: "This project has already been permanently removed." };
  }
  const supabase = await supabaseAction(p, "restore");
  const admin = createSupabaseAdminClient();
  await admin
    .from("projects")
    .update({ archived_at: null, teardown_after: null, teardown_status: null })
    .eq("id", p.id)
    .eq("workspace_id", opts.workspaceId);
  return { ok: true as const, restored: true, supabase };
}

/** Hard teardown of one archived project. Provider failures are recorded and retried by the next tick. */
export async function teardownProject(projectId: string) {
  const p = await loadProject(projectId);
  if (!p || !p.archived_at) return { ok: false as const, error: "not archived" };
  const status: TeardownStatus = { ...(p.teardown_status ?? {}), phase: "tearing_down", updatedAt: now() };
  await saveStatus(p.id, status);

  status.sandbox = p.teardown_status?.sandbox?.ok ? p.teardown_status.sandbox : await stopSandbox(p, null);
  status.supabase = await supabaseAction(p, "delete");
  status.vercel = await deleteVercelProject(p);
  status.github = await retireGitHubRepo(p);
  const allOk = [status.supabase, status.vercel, status.github].every((r) => r.ok);
  status.phase = allOk ? "torn_down" : "failed";
  status.updatedAt = now();
  await saveStatus(p.id, status);

  if (allOk) {
    const admin = createSupabaseAdminClient();
    console.info("[cander:teardown] removed", { projectId: p.id, status });
    await admin.from("projects").delete().eq("id", p.id);
  }
  return { ok: allOk, status };
}

/** Cron entry: tear down every project past its grace period (bounded per tick). */
export async function runProjectTeardownSweep(limit = 5) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id")
    .not("archived_at", "is", null)
    .lte("teardown_after", now())
    .order("teardown_after", { ascending: true })
    .limit(limit);
  const results: Array<{ projectId: string; ok: boolean }> = [];
  for (const row of data ?? []) {
    const id = String((row as { id: string }).id);
    const r = await teardownProject(id);
    results.push({ projectId: id, ok: r.ok });
  }
  return { swept: results.length, results };
}
