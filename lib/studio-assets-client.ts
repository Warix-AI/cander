/**
 * Studio canvas image persistence + edit helpers (client).
 */

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";

export const STUDIO_RESIZE_PRESETS = [
  { id: "square", label: "Square", ratio: "1:1", size: "1024x1024" as const },
  { id: "portrait", label: "Portrait", ratio: "3:4", size: "1024x1536" as const },
  { id: "story", label: "Story", ratio: "9:16", size: "1024x1536" as const },
  {
    id: "landscape",
    label: "Landscape",
    ratio: "4:3",
    size: "1536x1024" as const,
  },
  {
    id: "widescreen",
    label: "Widescreen",
    ratio: "16:9",
    size: "1536x1024" as const,
  },
] as const;

export type StudioResizePresetId = (typeof STUDIO_RESIZE_PRESETS)[number]["id"];

export function studioPresetById(id: StudioResizePresetId) {
  return STUDIO_RESIZE_PRESETS.find((preset) => preset.id === id) ?? STUDIO_RESIZE_PRESETS[0];
}

export function studioAspectParts(ratio: string | null | undefined): {
  w: number;
  h: number;
} {
  const raw = (ratio || "1:1").trim().replace("/", ":");
  const [aw, ah] = raw.split(":").map((part) => Number(part.trim()));
  if (!Number.isFinite(aw) || !Number.isFinite(ah) || aw <= 0 || ah <= 0) {
    return { w: 1, h: 1 };
  }
  return { w: aw, h: ah };
}

export type StudioAssetResult = {
  assetId: string;
  url: string;
  mimeType: string;
  aspectRatio?: string | null;
};

export function studioAssetImageUrl(assetId: string) {
  return `/api/studio/assets/${encodeURIComponent(assetId)}/image`;
}

export function isStudioAssetUrl(url: string | null | undefined) {
  if (!url) return false;
  return /\/api\/studio\/assets\/[^/]+\/image(?:\?|$)/.test(url);
}

async function authHeaders() {
  return getRawOpenAIAuthHeaders();
}

export async function uploadStudioProjectAsset(opts: {
  workspaceId: string;
  projectId: string;
  dataUrl: string;
  source?: "upload" | "generate" | "remove-bg" | "resize" | "suggest-edit";
  aspectRatio?: string | null;
}): Promise<StudioAssetResult> {
  const headers = await authHeaders();
  const res = await fetch("/api/studio/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      dataUrl: opts.dataUrl,
      source: opts.source ?? "upload",
      aspectRatio: opts.aspectRatio ?? null,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as StudioAssetResult & {
    error?: string;
  };
  if (!res.ok || !data.assetId || !data.url) {
    throw new Error(data.error || "Could not save Studio image.");
  }
  return {
    assetId: data.assetId,
    url: data.url,
    mimeType: data.mimeType || "image/png",
    aspectRatio: data.aspectRatio,
  };
}

export async function fetchFirstStudioGeneratedAsset(opts: {
  workspaceId: string;
  projectId: string;
}): Promise<StudioAssetResult | null> {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    source: "generate",
    order: "asc",
    limit: "1",
  });
  const res = await fetch(`/api/studio/assets?${params.toString()}`, {
    headers: { ...headers },
  });
  const data = (await res.json().catch(() => ({}))) as {
    assets?: StudioAssetResult[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "Could not load Studio images.");
  }
  return data.assets?.[0] ?? null;
}

/** Newest canvas image for a project (any source) — used to restore empty canvases. */
export async function fetchLatestStudioProjectAsset(opts: {
  workspaceId: string;
  projectId: string;
}): Promise<StudioAssetResult | null> {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    order: "desc",
    limit: "1",
  });
  const res = await fetch(`/api/studio/assets?${params.toString()}`, {
    headers: { ...headers },
  });
  const data = (await res.json().catch(() => ({}))) as {
    assets?: StudioAssetResult[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "Could not load Studio images.");
  }
  return data.assets?.[0] ?? null;
}

export async function editStudioProjectImage(opts: {
  workspaceId: string;
  projectId: string;
  imageUrl: string;
  action: "remove-bg" | "resize" | "suggest-edit";
  resizePreset?: StudioResizePresetId;
  prompt?: string;
  aspectRatio?: string | null;
}): Promise<StudioAssetResult> {
  const headers = await authHeaders();
  const res = await fetch("/api/studio/image-edit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(opts),
  });
  const data = (await res.json().catch(() => ({}))) as StudioAssetResult & {
    error?: string;
  };
  if (!res.ok || !data.assetId || !data.url) {
    throw new Error(data.error || "Could not edit Studio image.");
  }
  return {
    assetId: data.assetId,
    url: data.url,
    mimeType: data.mimeType || "image/png",
    aspectRatio: data.aspectRatio,
  };
}
