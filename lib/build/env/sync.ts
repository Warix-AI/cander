/**
 * Environment sync layer (server-only). `project_env_vars` is the source of
 * truth; values live either inline (public config) or in the vault (secrets).
 * Sync pushes them to Vercel by scope with hash-based drift detection. Values
 * are never logged.
 */

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vercelFetch } from "@/lib/build/vercel/api";
import { getProjectSecret, putProjectSecret, vaultConfigured } from "@/lib/build/secrets/vault";

export type EnvScope = "all" | "development" | "preview" | "production";

type EnvRow = {
  id: string;
  name: string;
  scope: EnvScope;
  plain_value: string | null;
  secret_id: string | null;
  vercel_synced_hash: string | null;
  vercel_env_id: string | null;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Upsert a plain (non-secret) env var row. */
export async function setProjectEnvVar(opts: {
  projectId: string;
  workspaceId: string;
  name: string;
  value: string;
  scope?: EnvScope;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("project_env_vars").upsert(
    {
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      name: opts.name,
      scope: opts.scope ?? "all",
      plain_value: opts.value,
      secret_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,name,scope" },
  );
  if (error) throw new Error(`env var upsert failed: ${error.message}`);
}

/** Upsert a secret env var: value → vault, row → reference. No-op without the vault key. */
export async function setProjectSecretEnvVar(opts: {
  projectId: string;
  workspaceId: string;
  name: string;
  value: string;
  scope?: EnvScope;
}): Promise<boolean> {
  if (!vaultConfigured()) return false;
  const secretId = await putProjectSecret({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    name: opts.name,
    value: opts.value,
    source: "provision",
    sensitivity: "server",
  });
  if (!secretId) return false;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("project_env_vars").upsert(
    {
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      name: opts.name,
      scope: opts.scope ?? "all",
      plain_value: null,
      secret_id: secretId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,name,scope" },
  );
  if (error) throw new Error(`env var upsert failed: ${error.message}`);
  return true;
}

async function resolveValue(projectId: string, row: EnvRow): Promise<string | null> {
  if (row.plain_value !== null) return row.plain_value;
  if (!row.secret_id) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("project_secrets").select("name").eq("id", row.secret_id).maybeSingle();
  if (!data?.name) return null;
  return getProjectSecret({ projectId, name: String(data.name) });
}

/**
 * For app projects with a ready backend, make sure the Supabase connection
 * vars exist as env rows so both sandbox and Vercel receive them from the
 * same place. Secrets only when the vault is configured.
 */
export async function ensureBackendEnvVars(opts: { projectId: string; workspaceId: string }): Promise<{ names: string[] }> {
  const { ensureAppSupabaseProject } = await import("@/lib/build/supabase/provision");
  const ensured = await ensureAppSupabaseProject({ ...opts, includeSecrets: true });
  if (ensured.status !== "ready" || !ensured.url || !ensured.secrets?.anonKey) return { names: [] };
  const names: string[] = [];
  await setProjectEnvVar({ ...opts, name: "NEXT_PUBLIC_SUPABASE_URL", value: ensured.url });
  names.push("NEXT_PUBLIC_SUPABASE_URL");
  await setProjectEnvVar({ ...opts, name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: ensured.secrets.anonKey });
  names.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (ensured.secrets.serviceRoleKey) {
    const stored = await setProjectSecretEnvVar({ ...opts, name: "SUPABASE_SERVICE_ROLE_KEY", value: ensured.secrets.serviceRoleKey });
    if (stored) names.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return { names };
}

/** Resolved name/value pairs for one runtime scope (values decrypted in-process; never log). */
export async function resolveEnvForScope(opts: { projectId: string; scope: Exclude<EnvScope, "all"> }): Promise<Array<{ name: string; value: string }>> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_env_vars")
    .select("id, name, scope, plain_value, secret_id, vercel_synced_hash, vercel_env_id")
    .eq("project_id", opts.projectId)
    .in("scope", ["all", opts.scope]);
  const out = new Map<string, string>();
  // Scoped rows win over "all".
  const rows = ((data ?? []) as EnvRow[]).sort((a, b) => (a.scope === "all" ? -1 : 1) - (b.scope === "all" ? -1 : 1));
  for (const row of rows) {
    const value = await resolveValue(opts.projectId, row);
    if (value !== null) out.set(row.name, value);
  }
  return [...out.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
}

const SCOPE_TARGETS: Record<EnvScope, string[]> = {
  all: ["production", "preview", "development"],
  development: ["development"],
  preview: ["preview"],
  production: ["production"],
};

export type VercelEnvSyncResult = { synced: string[]; unchanged: string[]; failed: string[] };

/**
 * Push env rows to the Vercel project. Idempotent: rows whose hash matches
 * the last sync are skipped; the rest are upserted by name+target.
 */
export async function syncProjectEnvToVercel(opts: {
  projectId: string;
  workspaceId: string;
  vercelProjectId: string;
}): Promise<VercelEnvSyncResult> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_env_vars")
    .select("id, name, scope, plain_value, secret_id, vercel_synced_hash, vercel_env_id")
    .eq("project_id", opts.projectId);
  const rows = (data ?? []) as EnvRow[];
  const result: VercelEnvSyncResult = { synced: [], unchanged: [], failed: [] };

  for (const row of rows) {
    const value = await resolveValue(opts.projectId, row);
    if (value === null) {
      result.failed.push(row.name);
      continue;
    }
    const h = hash(`${row.scope}:${value}`);
    if (row.vercel_synced_hash === h && row.vercel_env_id) {
      result.unchanged.push(row.name);
      continue;
    }
    const isSecret = row.secret_id !== null;
    const res = await vercelFetch(`/v10/projects/${encodeURIComponent(opts.vercelProjectId)}/env?upsert=true`, {
      method: "POST",
      body: JSON.stringify({
        key: row.name,
        value,
        type: isSecret ? "encrypted" : row.name.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted",
        target: SCOPE_TARGETS[row.scope] ?? SCOPE_TARGETS.all,
      }),
    });
    if (!res.ok) {
      console.warn("[cander:env] vercel upsert failed", { name: row.name, status: res.status });
      result.failed.push(row.name);
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as { created?: { id?: string }; id?: string };
    const envId = body.created?.id ?? body.id ?? row.vercel_env_id ?? null;
    await admin
      .from("project_env_vars")
      .update({ vercel_synced_hash: h, vercel_synced_at: new Date().toISOString(), vercel_env_id: envId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    result.synced.push(row.name);
  }
  return result;
}
