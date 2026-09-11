/**
 * Agent database tools (server-only). Executed on behalf of an in-sandbox
 * build job through the job-token tools route. The sandbox never holds the
 * database credentials; SQL runs through the Management API against the
 * project's own Supabase ref, resolved from the project record.
 *
 * Levels:
 *   read        SELECT / EXPLAIN / WITH … SELECT                → always allowed
 *   write       INSERT / UPDATE / DELETE (no DDL)               → allowed
 *   ddl         CREATE / ALTER / policies / functions           → only via migration
 *   destructive DROP / TRUNCATE / ALTER … DROP COLUMN           → refused; needs the user
 */

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseManagementFetch } from "@/lib/build/supabase/management";

export type SqlLevel = "read" | "write" | "ddl" | "destructive";

export function classifySql(sql: string): SqlLevel {
  const s = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (/\b(drop\s+(table|schema|database|policy|function|index|view|type|role)|truncate|alter\s+table\s+[^;]*\bdrop\b|delete\s+from\s+[a-z_."]+\s*;?$)/.test(s)) {
    return "destructive";
  }
  if (/\b(create|alter|grant|revoke|comment\s+on|enable\s+row\s+level\s+security|security\s+definer)\b/.test(s)) return "ddl";
  if (/^\s*(insert|update|delete|upsert|merge)\b/.test(s) || /;\s*(insert|update|delete)\b/.test(s)) return "write";
  return "read";
}

async function resolveRef(projectId: string, workspaceId: string): Promise<{ ref: string } | { error: string }> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("supabase_project_ref, supabase_status, kind")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return { error: "Project not found." };
  if (String(data.kind ?? "").toLowerCase() === "site") return { error: "This project is a static website and has no database." };
  if (!data.supabase_project_ref) return { error: "No database is connected yet. Build with demo data; Cander connects the database when the app is published or on request." };
  if (data.supabase_status !== "ready") return { error: "The database is still being set up. Try again in a moment." };
  return { ref: String(data.supabase_project_ref) };
}

async function runSql(ref: string, query: string): Promise<{ ok: true; rows: unknown } | { ok: false; error: string }> {
  const res = await supabaseManagementFetch(`/v1/projects/${encodeURIComponent(ref)}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = detail;
    try {
      const j = JSON.parse(detail) as { message?: string };
      if (j.message) message = j.message;
    } catch {
      /* raw */
    }
    return { ok: false, error: message.slice(0, 800) || `HTTP ${res.status}` };
  }
  return { ok: true, rows: await res.json().catch(() => []) };
}

function renderRows(rows: unknown, max = 50): string {
  if (!Array.isArray(rows)) return JSON.stringify(rows).slice(0, 4000);
  if (!rows.length) return "(no rows)";
  const shown = rows.slice(0, max);
  const text = JSON.stringify(shown, null, 0);
  return `${rows.length} row(s)${rows.length > max ? ` (showing ${max})` : ""}:\n${text.slice(0, 6000)}`;
}

/** Tables, columns and RLS state for the public schema, rendered for the model. */
export async function dbSchema(scope: { projectId: string; workspaceId: string }): Promise<string> {
  const r = await resolveRef(scope.projectId, scope.workspaceId);
  if ("error" in r) return r.error;
  const q = `
    select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default,
           t.rowsecurity as rls_enabled
    from information_schema.columns c
    join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
    where c.table_schema = 'public'
    order by c.table_name, c.ordinal_position;`;
  const res = await runSql(r.ref, q);
  if (!res.ok) return `Schema lookup failed: ${res.error}`;
  const rows = res.rows as Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null; rls_enabled: boolean }>;
  if (!Array.isArray(rows) || !rows.length) return "The database has no tables in the public schema yet.";
  const byTable = new Map<string, { rls: boolean; cols: string[] }>();
  for (const row of rows) {
    const t = byTable.get(row.table_name) ?? { rls: Boolean(row.rls_enabled), cols: [] };
    t.cols.push(`${row.column_name} ${row.data_type}${row.is_nullable === "NO" ? " not null" : ""}${row.column_default ? ` default ${row.column_default}` : ""}`);
    byTable.set(row.table_name, t);
  }
  const pol = await runSql(r.ref, `select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, policyname;`);
  const policies = new Map<string, string[]>();
  if (pol.ok && Array.isArray(pol.rows)) {
    for (const p of pol.rows as Array<{ tablename: string; policyname: string; cmd: string }>) {
      policies.set(p.tablename, [...(policies.get(p.tablename) ?? []), `${p.policyname} (${p.cmd})`]);
    }
  }
  const out: string[] = [];
  for (const [name, t] of byTable) {
    out.push(`${name} — RLS ${t.rls ? "on" : "OFF"}${policies.get(name)?.length ? `, policies: ${policies.get(name)!.join(", ")}` : t.rls ? ", no policies (nothing can read it)" : ""}`);
    for (const c of t.cols) out.push(`  ${c}`);
  }
  return out.join("\n").slice(0, 12000);
}

/** Run SQL at read/write level. DDL and destructive statements are refused with guidance. */
export async function dbSql(scope: { projectId: string; workspaceId: string }, sql: string): Promise<string> {
  const query = String(sql ?? "").trim();
  if (!query) return "ERROR: sql is required.";
  const level = classifySql(query);
  if (level === "destructive") return "REFUSED: this statement would destroy data (drop/truncate/unfiltered delete). Cander only runs that after the user confirms it in the product — ask them, or write a migration that keeps the data.";
  if (level === "ddl") return "REFUSED: schema changes must go through db_write_migration so they are versioned and replayed on the production database at publish.";
  const r = await resolveRef(scope.projectId, scope.workspaceId);
  if ("error" in r) return r.error;
  const res = await runSql(r.ref, query);
  if (!res.ok) return `SQL error: ${res.error}`;
  return level === "write" ? `OK (write). ${renderRows(res.rows, 20)}` : renderRows(res.rows);
}

/**
 * Apply one migration file (already written into the repo by the builder) to
 * the development database and record it in the ledger.
 */
export async function dbApplyMigration(
  scope: { projectId: string; workspaceId: string },
  input: { version: string; name?: string; filePath: string; sql: string; sha?: string | null },
): Promise<string> {
  const version = String(input.version ?? "").trim();
  const sql = String(input.sql ?? "").trim();
  const filePath = String(input.filePath ?? "").trim();
  if (!/^\d{8,14}(_[a-z0-9_-]+)?$/i.test(version)) return "ERROR: version must look like 20260911120000_short_name.";
  if (!sql) return "ERROR: sql is required.";
  if (!filePath.startsWith("supabase/migrations/")) return "ERROR: migrations must live in supabase/migrations/.";
  if (classifySql(sql) === "destructive") return "REFUSED: this migration drops or truncates data. Ask the user to confirm before applying; keep the file so they can decide.";
  if (/create\s+table/i.test(sql) && !/enable\s+row\s+level\s+security/i.test(sql)) {
    return "REFUSED: every new table must enable row level security in the same migration (alter table … enable row level security) and define policies.";
  }
  const r = await resolveRef(scope.projectId, scope.workspaceId);
  if ("error" in r) return r.error;

  const admin = createSupabaseAdminClient();
  const checksum = createHash("sha256").update(sql).digest("hex");
  const { data: prior } = await admin
    .from("project_migrations")
    .select("status, checksum")
    .eq("project_id", scope.projectId)
    .eq("version", version)
    .eq("applied_to", "development")
    .maybeSingle();
  if (prior?.status === "applied") {
    return prior.checksum === checksum
      ? `Migration ${version} is already applied to the development database.`
      : `ERROR: migration ${version} was already applied with different contents. Create a new migration instead of editing an applied one.`;
  }
  const res = await runSql(r.ref, sql);
  const base = {
    project_id: scope.projectId,
    workspace_id: scope.workspaceId,
    version,
    name: (input.name || version.replace(/^\d+_?/, "") || version).slice(0, 120),
    file_path: filePath,
    checksum,
    applied_to: "development" as const,
    applied_sha: input.sha ?? null,
  };
  await admin.from("project_migrations").delete().eq("project_id", scope.projectId).eq("version", version).eq("applied_to", "development");
  await admin.from("project_migrations").insert({
    ...base,
    status: res.ok ? "applied" : "failed",
    applied_at: res.ok ? new Date().toISOString() : null,
    error: res.ok ? null : res.error,
  });
  if (!res.ok) return `Migration ${version} failed: ${res.error}\nFix the SQL in ${filePath} and call db_apply_migration again.`;
  return `Migration ${version} applied to the development database. It will be applied to production automatically at publish.`;
}

/** TypeScript types for the schema (Management API). */
export async function dbTypes(scope: { projectId: string; workspaceId: string }): Promise<string> {
  const r = await resolveRef(scope.projectId, scope.workspaceId);
  if ("error" in r) return r.error;
  const res = await supabaseManagementFetch(`/v1/projects/${encodeURIComponent(r.ref)}/types/typescript?included_schemas=public`);
  if (!res.ok) return `ERROR: type generation failed (HTTP ${res.status}).`;
  const body = (await res.json().catch(() => ({}))) as { types?: string };
  return body.types ? body.types.slice(0, 200_000) : "ERROR: no types returned.";
}

export type RlsReport = { ok: boolean; issues: string[]; tables: number };

/** Real RLS audit: every public table must have RLS on and at least one policy. */
export async function dbRlsCheck(scope: { projectId: string; workspaceId: string }): Promise<RlsReport | { error: string }> {
  const r = await resolveRef(scope.projectId, scope.workspaceId);
  if ("error" in r) return { error: r.error };
  const res = await runSql(
    r.ref,
    `select t.tablename, t.rowsecurity,
            (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename) as policies
     from pg_tables t where t.schemaname = 'public' order by t.tablename;`,
  );
  if (!res.ok) return { error: `RLS check failed: ${res.error}` };
  const rows = (Array.isArray(res.rows) ? res.rows : []) as Array<{ tablename: string; rowsecurity: boolean; policies: number | string }>;
  const issues: string[] = [];
  for (const row of rows) {
    const policies = Number(row.policies);
    if (!row.rowsecurity) issues.push(`Table "${row.tablename}" has row level security OFF — anyone with the public key can read and write every row.`);
    else if (policies === 0) issues.push(`Table "${row.tablename}" has RLS on but no policies — the app cannot read it; add policies.`);
  }
  const buckets = await runSql(r.ref, `select name, public from storage.buckets where public = true;`);
  if (buckets.ok && Array.isArray(buckets.rows)) {
    for (const b of buckets.rows as Array<{ name: string }>) {
      issues.push(`Storage bucket "${b.name}" is public — confirm this is intended (only for assets meant to be world-readable).`);
    }
  }
  return { ok: issues.filter((i) => !i.includes("Storage bucket")).length === 0, issues, tables: rows.length };
}
