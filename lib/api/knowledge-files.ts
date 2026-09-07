"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { KnowledgeFile } from "@/lib/types";

export const KNOWLEDGE_FILES_BUCKET = "knowledge-files";

function safeFileName(name: string) {
  const normalized = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(-120) || "upload";
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadKnowledgeFile(opts: {
  workspaceId: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  file: File;
  contentText?: string;
}): Promise<KnowledgeFile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before uploading a knowledge file.");

  const fileId = `file-${crypto.randomUUID().replace(/-/g, "")}`;
  const storagePath = `${opts.workspaceId}/${opts.knowledgeBaseId}/${fileId}-${safeFileName(opts.file.name)}`;
  const mimeType = opts.file.type || "application/octet-stream";

  const { data: knowledgeBase } = await supabase
    .from("knowledge_bases")
    .select("id")
    .eq("id", opts.knowledgeBaseId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  // A newly-created local KB may not have reached the policy sync yet.
  if (!knowledgeBase) {
    const { error } = await supabase.from("knowledge_bases").insert({
      id: opts.knowledgeBaseId,
      workspace_id: opts.workspaceId,
      name: opts.knowledgeBaseName,
      summary: "Internal sources for this workspace.",
      sources_count: 0,
      updated_label: "Just now",
      version: 1,
    });
    if (error && error.code !== "23505") {
      throw new Error(error.message || "Could not save the knowledge base.");
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(KNOWLEDGE_FILES_BUCKET)
    .upload(storagePath, opts.file, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(uploadError.message || "Could not upload the knowledge file.");
  }

  const row = {
    id: fileId,
    knowledge_base_id: opts.knowledgeBaseId,
    workspace_id: opts.workspaceId,
    name: opts.file.name,
    size_label: fileSizeLabel(opts.file.size),
    uploaded_label: "Just now",
    content_text: opts.contentText?.slice(0, 200_000) ?? "",
    storage_path: storagePath,
    mime_type: mimeType,
    byte_size: opts.file.size,
  };

  const { error: rowError } = await supabase.from("knowledge_files").insert(row);
  if (rowError) {
    await supabase.storage.from(KNOWLEDGE_FILES_BUCKET).remove([storagePath]);
    throw new Error(rowError.message || "Could not save the knowledge file.");
  }

  const { data: currentBase } = await supabase
    .from("knowledge_bases")
    .select("sources_count")
    .eq("id", opts.knowledgeBaseId)
    .maybeSingle();
  await supabase
    .from("knowledge_bases")
    .update({
      sources_count: Number(currentBase?.sources_count ?? 0) + 1,
      updated_label: "Just now",
    })
    .eq("id", opts.knowledgeBaseId)
    .eq("workspace_id", opts.workspaceId);

  return {
    id: fileId,
    name: opts.file.name,
    size: row.size_label,
    uploadedAt: row.uploaded_label,
    ...(opts.contentText?.trim() ? { contentText: opts.contentText.slice(0, 200_000) } : {}),
    storagePath,
    mimeType,
    byteSize: opts.file.size,
  };
}

export async function removeKnowledgeFileFromSupabase(opts: {
  workspaceId: string;
  knowledgeBaseId: string;
  fileId: string;
  storagePath?: string;
}) {
  if (!isSupabaseConfigured()) return;

  const supabase = createSupabaseBrowserClient();
  let storagePath = opts.storagePath;
  if (!storagePath) {
    const { data } = await supabase
      .from("knowledge_files")
      .select("storage_path")
      .eq("id", opts.fileId)
      .eq("workspace_id", opts.workspaceId)
      .maybeSingle();
    storagePath = data?.storage_path ?? undefined;
  }

  if (storagePath) {
    const { error } = await supabase.storage
      .from(KNOWLEDGE_FILES_BUCKET)
      .remove([storagePath]);
    if (error) throw new Error(error.message || "Could not remove the stored file.");
  }

  const { error: rowError } = await supabase
    .from("knowledge_files")
    .delete()
    .eq("id", opts.fileId)
    .eq("workspace_id", opts.workspaceId)
    .eq("knowledge_base_id", opts.knowledgeBaseId);
  if (rowError) {
    throw new Error(rowError.message || "Could not remove the knowledge file.");
  }

  const { data: currentBase } = await supabase
    .from("knowledge_bases")
    .select("sources_count")
    .eq("id", opts.knowledgeBaseId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  await supabase
    .from("knowledge_bases")
    .update({
      sources_count: Math.max(0, Number(currentBase?.sources_count ?? 1) - 1),
      updated_label: "Just now",
    })
    .eq("id", opts.knowledgeBaseId)
    .eq("workspace_id", opts.workspaceId);
}
