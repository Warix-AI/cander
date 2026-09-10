/**
 * Server helpers for project brand assets (logo / favicon / OG image).
 * Storage bucket `project-assets` + `project_assets` metadata, mirroring
 * lib/studio-assets-server.ts. Signed URLs let the in-sandbox builder pull
 * the files without user credentials.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extForMime, parseDataUrl } from "@/lib/studio-assets-server";

export const PROJECT_ASSETS_BUCKET = "project-assets";
export type ProjectAssetRole = "logo" | "favicon" | "og_image" | "image";

export function newProjectAssetId() {
  return `pa_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function projectAssetImageUrl(projectId: string, assetId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;
}

export type ProjectAssetRecord = {
  assetId: string;
  role: ProjectAssetRole;
  url: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
};

export async function storeProjectAsset(opts: {
  userId: string;
  workspaceId: string;
  projectId: string;
  dataUrl: string;
  role: ProjectAssetRole;
  source?: "upload" | "generate";
}): Promise<ProjectAssetRecord> {
  const { mimeType, bytes } = parseDataUrl(opts.dataUrl);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Image is larger than 10 MB.");
  const assetId = newProjectAssetId();
  const ext = mimeType.includes("svg") ? "svg" : mimeType.includes("icon") ? "ico" : extForMime(mimeType);
  const storagePath = `${opts.workspaceId}/${opts.projectId}/${assetId}.${ext}`;
  const admin = createSupabaseAdminClient();

  const { error: uploadError } = await admin.storage
    .from(PROJECT_ASSETS_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message || "Storage upload failed.");

  const { error: rowError } = await admin.from("project_assets").insert({
    id: assetId,
    workspace_id: opts.workspaceId,
    project_id: opts.projectId,
    created_by: opts.userId,
    role: opts.role,
    storage_path: storagePath,
    mime_type: mimeType,
    byte_size: bytes.byteLength,
    source: opts.source ?? "upload",
  });
  if (rowError) {
    await admin.storage.from(PROJECT_ASSETS_BUCKET).remove([storagePath]);
    throw new Error(rowError.message || "Could not save asset metadata.");
  }
  return {
    assetId,
    role: opts.role,
    url: projectAssetImageUrl(opts.projectId, assetId),
    mimeType,
    byteSize: bytes.byteLength,
    createdAt: new Date().toISOString(),
  };
}

export async function readProjectAssetBytes(opts: {
  projectId: string;
  assetId: string;
}): Promise<{ bytes: Buffer; mimeType: string; workspaceId: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_assets")
    .select("storage_path, mime_type, workspace_id")
    .eq("id", opts.assetId)
    .eq("project_id", opts.projectId)
    .maybeSingle();
  if (!data) return null;
  const { data: blob, error } = await admin.storage
    .from(PROJECT_ASSETS_BUCKET)
    .download(String(data.storage_path));
  if (error || !blob) return null;
  return {
    bytes: Buffer.from(await blob.arrayBuffer()),
    mimeType: String(data.mime_type || "image/png"),
    workspaceId: String(data.workspace_id),
  };
}

export async function listProjectAssets(opts: {
  projectId: string;
  workspaceId: string;
  role?: ProjectAssetRole;
}): Promise<ProjectAssetRecord[]> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("project_assets")
    .select("id, role, mime_type, byte_size, created_at")
    .eq("project_id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (opts.role) q = q.eq("role", opts.role);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    assetId: String(r.id),
    role: r.role as ProjectAssetRole,
    url: projectAssetImageUrl(opts.projectId, String(r.id)),
    mimeType: String(r.mime_type),
    byteSize: Number(r.byte_size ?? 0),
    createdAt: String(r.created_at),
  }));
}

/** Time-limited URL the builder (no user session) can download from. */
export async function signedProjectAssetUrl(opts: {
  assetId: string;
  projectId: string;
  expiresInSec?: number;
}): Promise<{ url: string; mimeType: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_assets")
    .select("storage_path, mime_type")
    .eq("id", opts.assetId)
    .eq("project_id", opts.projectId)
    .maybeSingle();
  if (!data) return null;
  const { data: signed, error } = await admin.storage
    .from(PROJECT_ASSETS_BUCKET)
    .createSignedUrl(String(data.storage_path), opts.expiresInSec ?? 6 * 60 * 60);
  if (error || !signed?.signedUrl) return null;
  return { url: signed.signedUrl, mimeType: String(data.mime_type || "image/png") };
}
