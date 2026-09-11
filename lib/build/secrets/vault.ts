/**
 * Project secrets vault — AES-256-GCM at rest in `project_secrets`.
 * Server-only. Values are never logged and never returned to the browser or
 * the model; they flow only into sandbox env / Vercel env via sync.
 *
 * Key: CANDER_SECRETS_KEY (base64, 32 bytes). Rotate by adding a new version
 * and re-encrypting rows whose key_version is older.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const KEY_VERSION = 1;

export function vaultConfigured(): boolean {
  return Boolean(loadKey());
}

function loadKey(): Buffer | null {
  const raw = process.env.CANDER_SECRETS_KEY?.trim();
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function requireKey(): Buffer {
  const key = loadKey();
  if (!key) throw new Error("Secrets vault is not configured (CANDER_SECRETS_KEY).");
  return key;
}

export function encryptSecret(plain: string): { ciphertext: string; keyVersion: number } {
  const key = requireKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, tag, enc]).toString("base64"), keyVersion: KEY_VERSION };
}

export function decryptSecret(ciphertext: string): string {
  const key = requireKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export type SecretSource = "provision" | "user" | "integration" | "agent";
/** "server" never reaches the browser; "public" may be exposed as NEXT_PUBLIC_*. */
export type SecretSensitivity = "public" | "server";

/** Upsert one project secret. Returns the row id. Never throws on a missing vault key — returns null. */
export async function putProjectSecret(opts: {
  projectId: string;
  workspaceId: string;
  name: string;
  value: string;
  source: SecretSource;
  sensitivity?: SecretSensitivity;
}): Promise<string | null> {
  if (!vaultConfigured()) return null;
  const { ciphertext, keyVersion } = encryptSecret(opts.value);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("project_secrets")
    .upsert(
      {
        project_id: opts.projectId,
        workspace_id: opts.workspaceId,
        name: opts.name,
        ciphertext,
        key_version: keyVersion,
        source: opts.source,
        sensitivity: opts.sensitivity ?? "server",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,name" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`secret store failed: ${error.message}`);
  return String(data.id);
}

export async function getProjectSecret(opts: { projectId: string; name: string }): Promise<string | null> {
  if (!vaultConfigured()) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_secrets")
    .select("ciphertext")
    .eq("project_id", opts.projectId)
    .eq("name", opts.name)
    .maybeSingle();
  if (!data?.ciphertext) return null;
  return decryptSecret(String(data.ciphertext));
}

export async function listProjectSecretNames(projectId: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("project_secrets").select("name").eq("project_id", projectId);
  return (data ?? []).map((r) => String((r as { name: string }).name)).sort();
}
