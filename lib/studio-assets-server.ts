/**
 * Server helpers for Studio canvas assets (Storage + metadata).
 */

import { readChatAttachmentImageBytes } from "@/lib/ai/raw-openai/attachment-image-bytes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { studioAssetImageUrl } from "@/lib/studio-assets-client";

export const STUDIO_ASSETS_BUCKET = "studio-assets";

export function newStudioAssetId() {
  return `sta_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function parseDataUrl(dataUrl: string): {
  mimeType: string;
  bytes: Buffer;
} {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("Invalid image data URL.");
  const mimeType = m[1] || "image/png";
  const bytes = Buffer.from(m[2] || "", "base64");
  if (!bytes.byteLength) throw new Error("Empty image payload.");
  return { mimeType, bytes };
}

export function extForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "png";
}

export async function assertWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function assertProjectInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return Boolean(data);
}

export async function storeStudioAsset(opts: {
  userId: string;
  workspaceId: string;
  projectId: string;
  dataUrl: string;
  source: "upload" | "generate" | "remove-bg" | "resize" | "suggest-edit";
  aspectRatio?: string | null;
}): Promise<{
  assetId: string;
  url: string;
  mimeType: string;
  storagePath: string;
  aspectRatio: string | null;
}> {
  const { mimeType, bytes } = parseDataUrl(opts.dataUrl);
  const assetId = newStudioAssetId();
  const ext = extForMime(mimeType);
  const storagePath = `${opts.workspaceId}/${opts.projectId}/${assetId}.${ext}`;
  const admin = createSupabaseAdminClient();

  const { error: uploadError } = await admin.storage
    .from(STUDIO_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(uploadError.message || "Storage upload failed.");
  }

  const { error: rowError } = await admin.from("studio_project_assets").insert({
    id: assetId,
    workspace_id: opts.workspaceId,
    project_id: opts.projectId,
    created_by: opts.userId,
    kind: "image",
    storage_path: storagePath,
    mime_type: mimeType,
    byte_size: bytes.byteLength,
    aspect_ratio: opts.aspectRatio ?? null,
    source: opts.source,
  });
  if (rowError) {
    await admin.storage.from(STUDIO_ASSETS_BUCKET).remove([storagePath]);
    throw new Error(rowError.message || "Could not save asset metadata.");
  }

  return {
    assetId,
    url: studioAssetImageUrl(assetId),
    mimeType,
    storagePath,
    aspectRatio: opts.aspectRatio ?? null,
  };
}

export type StudioAssetSource =
  | "upload"
  | "generate"
  | "remove-bg"
  | "resize"
  | "suggest-edit";

export async function listStudioProjectAssets(opts: {
  workspaceId: string;
  projectId: string;
  userId: string;
  source?: StudioAssetSource;
  oldestFirst?: boolean;
  limit?: number;
}): Promise<
  Array<{
    assetId: string;
    url: string;
    mimeType: string;
    aspectRatio: string | null;
    source: string;
    createdAt: string;
  }>
> {
  const member = await assertWorkspaceMember(opts.workspaceId, opts.userId);
  if (!member) return [];
  const projectOk = await assertProjectInWorkspace(
    opts.projectId,
    opts.workspaceId,
  );
  if (!projectOk) return [];

  const admin = createSupabaseAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 1, 1), 40);
  let query = admin
    .from("studio_project_assets")
    .select("id, mime_type, aspect_ratio, source, created_at")
    .eq("workspace_id", opts.workspaceId)
    .eq("project_id", opts.projectId)
    .eq("kind", "image")
    .order("created_at", { ascending: Boolean(opts.oldestFirst) })
    .limit(limit);
  if (opts.source) query = query.eq("source", opts.source);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => ({
    assetId: String(row.id),
    url: studioAssetImageUrl(String(row.id)),
    mimeType: String(row.mime_type || "image/png"),
    aspectRatio: row.aspect_ratio ? String(row.aspect_ratio) : null,
    source: String(row.source || "upload"),
    createdAt: String(row.created_at || ""),
  }));
}

export async function readStudioAssetBytes(
  assetId: string,
  userId: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("studio_project_assets")
    .select("storage_path, mime_type, workspace_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!row) return null;
  const ok = await assertWorkspaceMember(String(row.workspace_id), userId);
  if (!ok) return null;

  const { data, error } = await admin.storage
    .from(STUDIO_ASSETS_BUCKET)
    .download(String(row.storage_path));
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return {
    bytes: Buffer.from(ab),
    mimeType: String(row.mime_type || "image/png"),
  };
}

export async function resolveImageInputToDataUrl(
  imageUrl: string,
  userId: string,
): Promise<string> {
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith("data:")) return trimmed;

  const assetMatch = /\/api\/studio\/assets\/([^/]+)\/image/.exec(trimmed);
  if (assetMatch?.[1]) {
    const asset = await readStudioAssetBytes(
      decodeURIComponent(assetMatch[1]),
      userId,
    );
    if (!asset) throw new Error("Studio image not found.");
    return `data:${asset.mimeType};base64,${asset.bytes.toString("base64")}`;
  }

  const chatMatch =
    /\/api\/ai\/raw-openai\/attachments\/([^/]+)\/image/.exec(trimmed);
  if (chatMatch?.[1]) {
    const asset = await readChatAttachmentImageBytes(
      decodeURIComponent(chatMatch[1]),
      userId,
    );
    if (!asset) throw new Error("Generated image not found.");
    return `data:${asset.mimeType};base64,${asset.bytes.toString("base64")}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error("Could not fetch source image.");
    const mimeType = res.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  }

  throw new Error("Unsupported image source.");
}
