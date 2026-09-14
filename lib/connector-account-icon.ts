/**
 * Per-account icon upload for connector connections (bucket: connector-account-icons).
 * Path: {ownerId}/{connectionId}/icon.{ext}
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";

export const CONNECTOR_ACCOUNT_ICONS_BUCKET = "connector-account-icons";

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function extensionFor(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

function publicIconUrl(path: string) {
  const supabase = createSupabaseBrowserClient();
  const { data } = supabase.storage
    .from(CONNECTOR_ACCOUNT_ICONS_BUCKET)
    .getPublicUrl(path);
  const base = data.publicUrl.split("?")[0] ?? data.publicUrl;
  return `${base}?v=${Date.now()}`;
}

function folderPath(ownerId: string, connectionId: string) {
  return `${ownerId}/${connectionId}`;
}

/** Upload image; returns public URL. Does not write the DB column. */
export async function uploadConnectorAccountIcon(input: {
  ownerId: string;
  connectionId: string;
  file: File;
}): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  if (!ALLOWED.has(input.file.type)) {
    throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
  }
  if (input.file.size > 5 * 1024 * 1024) {
    throw new Error("Image is too large. Keep it under 5 MB.");
  }

  const supabase = createSupabaseBrowserClient();
  const ext = extensionFor(input.file.type);
  const folder = folderPath(input.ownerId, input.connectionId);
  const path = `${folder}/icon.${ext}`;

  const { data: existing } = await supabase.storage
    .from(CONNECTOR_ACCOUNT_ICONS_BUCKET)
    .list(folder);
  const stale = (existing ?? [])
    .map((row) => row.name)
    .filter((name) => name.startsWith("icon.") && name !== `icon.${ext}`)
    .map((name) => `${folder}/${name}`);
  if (stale.length) {
    await supabase.storage.from(CONNECTOR_ACCOUNT_ICONS_BUCKET).remove(stale);
  }

  const { error: uploadError } = await supabase.storage
    .from(CONNECTOR_ACCOUNT_ICONS_BUCKET)
    .upload(path, input.file, {
      upsert: true,
      contentType: input.file.type,
      cacheControl: "3600",
    });
  if (uploadError) {
    throw new Error(uploadError.message || "Could not upload image.");
  }

  return publicIconUrl(path);
}

/** Remove Storage objects for this account icon (DB clear is separate). */
export async function removeConnectorAccountIconFiles(input: {
  ownerId: string;
  connectionId: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createSupabaseBrowserClient();
  const folder = folderPath(input.ownerId, input.connectionId);
  const { data: existing } = await supabase.storage
    .from(CONNECTOR_ACCOUNT_ICONS_BUCKET)
    .list(folder);
  const paths = (existing ?? [])
    .map((row) => row.name)
    .filter((name) => name.startsWith("icon."))
    .map((name) => `${folder}/${name}`);
  if (!paths.length) return;
  const { error } = await supabase.storage
    .from(CONNECTOR_ACCOUNT_ICONS_BUCKET)
    .remove(paths);
  if (error) throw new Error(error.message || "Could not remove image.");
}
