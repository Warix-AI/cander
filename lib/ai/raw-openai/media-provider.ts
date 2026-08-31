/**
 * OpenAIMediaProvider — centralized OpenAI Files / Responses media helpers.
 * Server-only. Platforms capture bytes; this module talks to OpenAI.
 */

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { AttachmentRef, ResponseContentPart } from "./build-input.ts";

export type NormalizedAttachmentBytes = {
  filename: string;
  mimeType: string;
  byteLength: number;
  bytes: Buffer;
  type: "image" | "document";
};

export type GeneratedImageResult = {
  /** data URL for UI rendering */
  dataUrl: string;
  mimeType: string;
  /** OpenAI file id after re-upload for follow-ups (optional) */
  openaiFileId?: string;
  attachmentId?: string;
};

export function createOpenAIMediaClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export async function uploadFileToOpenAI(
  client: OpenAI,
  att: NormalizedAttachmentBytes,
  purpose: "user_data" = "user_data",
): Promise<{ openaiFileId: string }> {
  const openaiFile = await client.files.create({
    file: await toFile(att.bytes, att.filename || "upload", {
      type: att.mimeType,
    }),
    purpose,
  });
  return { openaiFileId: openaiFile.id };
}

export function prepareImageInput(openaiFileId: string): ResponseContentPart {
  return {
    type: "input_image",
    file_id: openaiFileId,
    detail: "auto",
  };
}

export function prepareDocumentInput(openaiFileId: string): ResponseContentPart {
  return {
    type: "input_file",
    file_id: openaiFileId,
  };
}

export function prepareAttachmentParts(
  refs: AttachmentRef[],
): ResponseContentPart[] {
  const parts: ResponseContentPart[] = [];
  for (const ref of refs) {
    if (ref.attachmentType === "image") {
      parts.push(prepareImageInput(ref.openaiFileId));
    } else if (ref.attachmentType === "document") {
      parts.push(prepareDocumentInput(ref.openaiFileId));
    }
  }
  return parts;
}

/** Detect image_generation tool invocations in Responses output. */
export function didOpenAIUseImageGeneration(
  output: Array<{ type?: string } | null | undefined> | null | undefined,
): boolean {
  if (!Array.isArray(output)) return false;
  return output.some((item) => item?.type === "image_generation_call");
}

/**
 * Extract completed image_generation_call results as data URLs.
 * OpenAI returns base64 in `result` without a data: prefix.
 */
export function extractGeneratedImages(
  output: OpenAI.Responses.Response["output"] | null | undefined,
): GeneratedImageResult[] {
  if (!Array.isArray(output)) return [];
  const out: GeneratedImageResult[] = [];
  for (const item of output) {
    if (!item || item.type !== "image_generation_call") continue;
    if (item.status !== "completed") continue;
    const b64 = typeof item.result === "string" ? item.result.trim() : "";
    if (!b64) continue;
    const mimeType = "image/png";
    out.push({
      dataUrl: b64.startsWith("data:")
        ? b64
        : `data:${mimeType};base64,${b64}`,
      mimeType,
    });
  }
  return out;
}

/** Re-upload a generated data URL so follow-ups can reference file_id. */
export async function persistGeneratedImageFile(
  client: OpenAI,
  dataUrl: string,
  filename = "generated.png",
): Promise<{ openaiFileId: string; bytes: Buffer; mimeType: string; size: number }> {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid generated image data URL.");
  const mimeType = m[1] || "image/png";
  const bytes = Buffer.from(m[2] || "", "base64");
  const { openaiFileId } = await uploadFileToOpenAI(client, {
    filename,
    mimeType,
    byteLength: bytes.byteLength,
    bytes,
    type: "image",
  });
  return { openaiFileId, bytes, mimeType, size: bytes.byteLength };
}

/**
 * Direct Images API fallback when the chat model skips the image_generation tool.
 */
export async function generateImageViaImagesApi(
  client: OpenAI,
  prompt: string,
  opts?: { model?: string; quality?: "low" | "medium" | "high" | "auto" },
): Promise<GeneratedImageResult> {
  const model = opts?.model || "gpt-image-1.5";
  const quality =
    opts?.quality === "auto" ? "medium" : opts?.quality || "medium";
  const result = await client.images.generate({
    model,
    prompt: prompt.slice(0, 32000),
    quality,
    size: "1024x1024",
    // gpt-image returns b64_json by default for these models
  });
  const b64 = result.data?.[0]?.b64_json?.trim();
  if (!b64) {
    throw new Error("Images API returned no image data.");
  }
  const mimeType = "image/png";
  return {
    dataUrl: `data:${mimeType};base64,${b64}`,
    mimeType,
  };
}
