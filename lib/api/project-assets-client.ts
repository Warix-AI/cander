"use client";

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";

export type ProjectAssetClient = {
  assetId: string;
  role: "logo" | "favicon" | "og_image" | "image";
  url: string;
  mimeType: string;
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export async function uploadProjectAsset(opts: {
  projectId: string;
  workspaceId: string;
  file: File;
  role: ProjectAssetClient["role"];
}): Promise<ProjectAssetClient | null> {
  const dataUrl = await fileToDataUrl(opts.file);
  const headers = await getRawOpenAIAuthHeaders();
  const res = await fetch(`/api/projects/${encodeURIComponent(opts.projectId)}/assets`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: opts.workspaceId, dataUrl, role: opts.role }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { asset?: ProjectAssetClient } | null;
  return data?.asset ?? null;
}
