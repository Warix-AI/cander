"use client";

/**
 * Client helpers for sharing markdown project tabs.
 */

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";
import {
  markdownShareUrl,
  newMarkdownShareId,
  summarizeMarkdownTitle,
} from "@/lib/shared-markdown";

export async function publishMarkdownShare(opts: {
  workspaceId: string;
  projectId: string;
  title: string;
  markdown: string;
  shareId?: string | null;
}): Promise<{ id: string; url: string; title: string }> {
  const headers = await getRawOpenAIAuthHeaders();
  // Local / unsigned: still mint a stable id so the address bar has a URL.
  if (!headers.Authorization) {
    const id = opts.shareId?.trim() || newMarkdownShareId();
    return {
      id,
      url: markdownShareUrl(id),
      title: opts.title || summarizeMarkdownTitle(opts.markdown),
    };
  }

  const response = await fetch("/api/share/markdown", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      title: opts.title,
      markdown: opts.markdown,
      shareId: opts.shareId,
    }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error || "Could not create share link.");
  }
  const data = (await response.json()) as {
    id: string;
    url: string;
    title: string;
  };
  return data;
}

export async function renameMarkdownShare(opts: {
  shareId: string;
  title: string;
}): Promise<void> {
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) return;
  await fetch("/api/share/markdown", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      shareId: opts.shareId,
      title: opts.title,
    }),
  });
}
