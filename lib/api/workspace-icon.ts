import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { clearWorkspaceIcon, setWorkspaceIcon } from "@/lib/workspace-icons";

export const WORKSPACE_ICONS_BUCKET = "workspace-icons";

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

async function persistIconUrl(workspaceId: string, iconUrl: string | null) {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to update this workspace.");
  const response = await fetch("/api/workspace/icon", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ workspaceId, iconUrl }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Could not save workspace icon.");
}

function publicIconUrl(path: string) {
  const supabase = createSupabaseBrowserClient();
  const { data } = supabase.storage.from(WORKSPACE_ICONS_BUCKET).getPublicUrl(path);
  const base = data.publicUrl.split("?")[0] ?? data.publicUrl;
  return `${base}?v=${Date.now()}`;
}

export async function uploadWorkspaceIcon(input: {
  workspaceId: string;
  file: File;
}): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  if (!ALLOWED.has(input.file.type)) {
    throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
  }
  if (input.file.size > 5 * 1024 * 1024) {
    throw new Error("Image is too large. Keep it under 5 MB.");
  }

  const supabase = createSupabaseBrowserClient();
  const ext = extensionFor(input.file.type);
  const path = `${input.workspaceId}/icon.${ext}`;
  const { data: existing } = await supabase.storage
    .from(WORKSPACE_ICONS_BUCKET)
    .list(input.workspaceId);
  const stale = (existing ?? [])
    .map((row) => row.name)
    .filter((name) => name.startsWith("icon.") && name !== `icon.${ext}`)
    .map((name) => `${input.workspaceId}/${name}`);
  if (stale.length) {
    await supabase.storage.from(WORKSPACE_ICONS_BUCKET).remove(stale);
  }

  const { error: uploadError } = await supabase.storage
    .from(WORKSPACE_ICONS_BUCKET)
    .upload(path, input.file, {
      upsert: true,
      contentType: input.file.type,
      cacheControl: "3600",
    });
  if (uploadError) throw new Error(uploadError.message || "Could not upload workspace icon.");

  const url = publicIconUrl(path);
  await persistIconUrl(input.workspaceId, url);
  setWorkspaceIcon(input.workspaceId, url);
  return url;
}

export async function removeWorkspaceIcon(workspaceId: string) {
  if (!isSupabaseConfigured()) {
    clearWorkspaceIcon(workspaceId);
    return;
  }
  const supabase = createSupabaseBrowserClient();
  const { data: existing } = await supabase.storage
    .from(WORKSPACE_ICONS_BUCKET)
    .list(workspaceId);
  const paths = (existing ?? [])
    .map((row) => row.name)
    .filter((name) => name.startsWith("icon."))
    .map((name) => `${workspaceId}/${name}`);
  if (paths.length) {
    const { error } = await supabase.storage.from(WORKSPACE_ICONS_BUCKET).remove(paths);
    if (error) throw new Error(error.message || "Could not remove workspace icon.");
  }
  await persistIconUrl(workspaceId, null);
  clearWorkspaceIcon(workspaceId);
}
