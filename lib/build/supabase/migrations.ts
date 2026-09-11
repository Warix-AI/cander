/**
 * Project database migrations (server-only). Schema history lives in the
 * project's repo under supabase/migrations/*.sql; this applies pending files
 * to the project's Supabase database through the Management API and records
 * every outcome in the project_migrations ledger. Used by publish (production)
 * and, later, by the agent's db tools (development).
 */

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listTipPaths, readTipFile } from "@/lib/build/git/tip-inspect";
import { supabaseManagementFetch } from "@/lib/build/supabase/management";

export type MigrationTarget = "development" | "production";

export type ApplyMigrationsResult = {
  ok: boolean;
  applied: string[];
  skipped: string[];
  failed: { version: string; error: string } | null;
};

const MIGRATION_RE = /^supabase\/migrations\/([^/]+)\.sql$/;

/** The ledger's uniqueness is an expression index, so replace-by-key by hand. */
async function writeLedger(
  base: { project_id: string; workspace_id: string; version: string; name: string; file_path: string; checksum: string; applied_to: MigrationTarget; applied_sha: string },
  patch: Record<string, unknown>,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("project_migrations")
    .delete()
    .eq("project_id", base.project_id)
    .eq("version", base.version)
    .eq("applied_to", base.applied_to);
  const { error } = await admin.from("project_migrations").insert({ ...base, ...patch });
  if (error) console.warn("[cander:migrations] ledger write failed", error.message);
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/**
 * Apply every migration file at `sha` that the ledger has not recorded as
 * applied for `target`. Stops at the first failure (recorded), leaving the
 * remaining files pending. Files are applied in version (filename) order.
 */
export async function applyPendingMigrations(opts: {
  projectId: string;
  workspaceId: string;
  githubFullName: string;
  sha: string;
  supabaseRef: string;
  target: MigrationTarget;
}): Promise<ApplyMigrationsResult> {
  const paths = (await listTipPaths({ fullName: opts.githubFullName, draftSha: opts.sha }))
    .filter((p) => MIGRATION_RE.test(p))
    .sort();
  if (!paths.length) return { ok: true, applied: [], skipped: [], failed: null };

  const admin = createSupabaseAdminClient();
  const { data: ledgerRows } = await admin
    .from("project_migrations")
    .select("version, checksum, status")
    .eq("project_id", opts.projectId)
    .eq("applied_to", opts.target);
  const applied = new Map<string, { checksum: string; status: string }>();
  for (const r of (ledgerRows ?? []) as Array<{ version: string; checksum: string; status: string }>) {
    applied.set(r.version, { checksum: r.checksum, status: r.status });
  }

  const result: ApplyMigrationsResult = { ok: true, applied: [], skipped: [], failed: null };
  for (const path of paths) {
    const version = path.match(MIGRATION_RE)![1]!;
    const prior = applied.get(version);
    if (prior?.status === "applied") {
      result.skipped.push(version);
      continue;
    }
    const sql = await readTipFile({ fullName: opts.githubFullName, draftSha: opts.sha, path });
    if (sql === null) {
      result.failed = { version, error: "could not read migration file" };
      result.ok = false;
      break;
    }
    const sum = checksum(sql);
    const base = {
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      version,
      name: version.replace(/^\d+_?/, "") || version,
      file_path: path,
      checksum: sum,
      applied_to: opts.target,
      applied_sha: opts.sha,
    };
    const res = await supabaseManagementFetch(`/v1/projects/${encodeURIComponent(opts.supabaseRef)}/database/query`, {
      method: "POST",
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      await writeLedger(base, { status: "applied", applied_at: new Date().toISOString(), error: null });
      result.applied.push(version);
    } else {
      const detail = (await res.text().catch(() => "")).slice(0, 800);
      await writeLedger(base, { status: "failed", error: detail });
      result.failed = { version, error: detail || `HTTP ${res.status}` };
      result.ok = false;
      break;
    }
  }
  return result;
}
