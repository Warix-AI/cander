/**
 * Client helpers for raw OpenAI upload / auth headers.
 * API secrets stay server-side only.
 */

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "../../supabase/env.ts";

export type UploadedAttachment = {
  id: string;
  openaiFileId: string;
  attachmentType: "image" | "document";
  filename: string;
  mimeType: string;
  size: number;
};

export async function getRawOpenAIAuthHeaders(): Promise<Record<string, string>> {
  try {
    const url = supabaseUrl();
    const key = supabaseAnonKey();
    const supabase = createBrowserClient(url, key);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  } catch {
    return {};
  }
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } | null {
  // Avoid the /s (dotAll) flag — project TS target is below ES2018.
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const isBase64 = Boolean(m[2]);
  const data = m[3] || "";
  if (isBase64) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type: mime }), mime };
  }
  return {
    blob: new Blob([decodeURIComponent(data)], { type: mime }),
    mime,
  };
}

export async function uploadRawOpenAIAttachment(opts: {
  file?: File | Blob;
  dataUrl?: string;
  filename: string;
  mimeType: string;
  threadId?: string | null;
  attachmentType: "image" | "document" | "file";
  onProgress?: (label: string) => void;
}): Promise<UploadedAttachment> {
  opts.onProgress?.("Uploading…");
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sign in to upload attachments.");
  }

  let blob: Blob;
  let mime = opts.mimeType;
  if (opts.file) {
    blob = opts.file;
    mime = opts.file.type || mime;
  } else if (opts.dataUrl) {
    const parsed = dataUrlToBlob(opts.dataUrl);
    if (!parsed) throw new Error("Invalid image data.");
    blob = parsed.blob;
    mime = parsed.mime || mime;
  } else {
    throw new Error("No file bytes to upload.");
  }

  const form = new FormData();
  form.append(
    "file",
    new File([blob], opts.filename || "upload", { type: mime }),
  );
  if (opts.threadId) form.append("threadId", opts.threadId);
  form.append(
    "attachmentType",
    opts.attachmentType === "file" ? "document" : opts.attachmentType,
  );

  const res = await fetch("/api/ai/raw-openai/upload", {
    method: "POST",
    headers,
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    openaiFileId?: string;
    attachmentType?: "image" | "document";
    filename?: string;
    mimeType?: string;
    size?: number;
    error?: string;
  };
  if (!res.ok || data.error || !data.id || !data.openaiFileId) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return {
    id: data.id,
    openaiFileId: data.openaiFileId,
    attachmentType: data.attachmentType || "document",
    filename: data.filename || opts.filename,
    mimeType: data.mimeType || mime,
    size: data.size || blob.size,
  };
}

export async function linkRawOpenAIAttachments(opts: {
  attachmentIds: string[];
  messageId: string;
  threadId?: string | null;
}): Promise<void> {
  if (!opts.attachmentIds.length) return;
  const auth = await getRawOpenAIAuthHeaders();
  if (!auth.Authorization) return;
  const headers: Record<string, string> = {
    ...auth,
    "Content-Type": "application/json",
  };
  await fetch("/api/ai/raw-openai/upload", {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      attachmentIds: opts.attachmentIds,
      messageId: opts.messageId,
      threadId: opts.threadId,
    }),
  }).catch(() => {});
}

export async function transcribeRawOpenAIAudio(
  blob: Blob,
  filename = "dictation.webm",
): Promise<string> {
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sign in to use voice dictation.");
  }
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: blob.type || "audio/webm" }));
  const res = await fetch("/api/ai/raw-openai/transcribe", {
    method: "POST",
    headers,
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };
  if (!res.ok || data.error) {
    throw new Error(data.error || `Transcription failed (${res.status})`);
  }
  return (data.text || "").trim();
}
