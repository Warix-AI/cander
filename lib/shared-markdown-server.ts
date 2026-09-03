/**
 * Server helpers for shared markdown docs.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isMarkdownShareId,
  newMarkdownShareId,
} from "@/lib/shared-markdown";

export type SharedMarkdownDoc = {
  id: string;
  title: string;
  markdown: string;
  workspaceId: string;
  projectId: string;
  createdBy: string;
};

export async function upsertSharedMarkdownDoc(opts: {
  userId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  markdown: string;
  shareId?: string | null;
}): Promise<SharedMarkdownDoc> {
  const admin = createSupabaseAdminClient();
  const id =
    opts.shareId && isMarkdownShareId(opts.shareId)
      ? opts.shareId
      : newMarkdownShareId();

  const row = {
    id,
    workspace_id: opts.workspaceId,
    project_id: opts.projectId,
    created_by: opts.userId,
    title: opts.title.trim() || "Document",
    markdown: opts.markdown,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("shared_markdown_docs")
    .upsert(row, { onConflict: "id" })
    .select("id, title, markdown, workspace_id, project_id, created_by")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not save shared document.");
  }

  return {
    id: data.id,
    title: data.title,
    markdown: data.markdown,
    workspaceId: data.workspace_id,
    projectId: data.project_id,
    createdBy: data.created_by,
  };
}

export async function fetchSharedMarkdownDoc(
  shareId: string,
): Promise<SharedMarkdownDoc | null> {
  if (!isMarkdownShareId(shareId)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("shared_markdown_docs")
    .select("id, title, markdown, workspace_id, project_id, created_by")
    .eq("id", shareId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    title: data.title,
    markdown: data.markdown,
    workspaceId: data.workspace_id,
    projectId: data.project_id,
    createdBy: data.created_by,
  };
}

export async function renameSharedMarkdownDoc(opts: {
  userId: string;
  shareId: string;
  title: string;
}): Promise<boolean> {
  if (!isMarkdownShareId(opts.shareId)) return false;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("shared_markdown_docs")
    .update({ title: opts.title.trim() || "Document" })
    .eq("id", opts.shareId)
    .eq("created_by", opts.userId)
    .select("id")
    .maybeSingle();
  return Boolean(data) && !error;
}
