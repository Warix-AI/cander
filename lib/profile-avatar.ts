/**
 * Profile avatar upload/remove via Supabase Storage (bucket: profile-avatars).
 * Stores a public URL on profiles.avatar_url for cross-device persistence.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearProfilePhoto, setProfilePhoto } from "@/lib/profile-photos";

export const PROFILE_AVATARS_BUCKET = "profile-avatars";

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

function publicAvatarUrl(path: string) {
  const supabase = createSupabaseBrowserClient();
  const { data } = supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .getPublicUrl(path);
  // Cache-bust so Replace updates the same path everywhere.
  const base = data.publicUrl.split("?")[0] ?? data.publicUrl;
  return `${base}?v=${Date.now()}`;
}

/** Upload image to Storage and persist URL on profiles.avatar_url. */
export async function uploadProfileAvatar(input: {
  userId: string;
  file: File;
}): Promise<string> {
  if (!ALLOWED.has(input.file.type)) {
    throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
  }
  if (input.file.size > 5 * 1024 * 1024) {
    throw new Error("Image is too large. Keep it under 5 MB.");
  }

  const supabase = createSupabaseBrowserClient();
  const ext = extensionFor(input.file.type);
  const path = `${input.userId}/avatar.${ext}`;

  // Remove other extensions so only one avatar object remains.
  const { data: existing } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .list(input.userId);
  const stale = (existing ?? [])
    .map((row) => row.name)
    .filter((name) => name.startsWith("avatar.") && name !== `avatar.${ext}`)
    .map((name) => `${input.userId}/${name}`);
  if (stale.length) {
    await supabase.storage.from(PROFILE_AVATARS_BUCKET).remove(stale);
  }

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .upload(path, input.file, {
      upsert: true,
      contentType: input.file.type,
      cacheControl: "3600",
    });
  if (uploadError) throw new Error(uploadError.message || "Could not upload image.");

  const url = publicAvatarUrl(path);
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", input.userId);
  if (profileError) {
    throw new Error(profileError.message || "Could not save profile photo.");
  }

  setProfilePhoto(input.userId, url);
  return url;
}

/** Clear Storage object(s) and profiles.avatar_url. */
export async function removeProfileAvatar(userId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data: existing } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .list(userId);
  const paths = (existing ?? [])
    .map((row) => row.name)
    .filter((name) => name.startsWith("avatar."))
    .map((name) => `${userId}/${name}`);
  if (paths.length) {
    const { error } = await supabase.storage
      .from(PROFILE_AVATARS_BUCKET)
      .remove(paths);
    if (error) throw new Error(error.message || "Could not remove image.");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId);
  if (profileError) {
    throw new Error(profileError.message || "Could not clear profile photo.");
  }

  clearProfilePhoto(userId);
}
