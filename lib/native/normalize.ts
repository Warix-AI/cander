/**
 * Shared attachment normalizer: NativePickedFile → ChatSendAttachment.
 * Single place for JPEG/PDF/CSV/text extraction — platforms only pick.
 */

import type { ChatSendAttachment } from "../types.ts";
import {
  ensureJpegDataUrl,
  imageFileToAttachment,
} from "../composer-attach.ts";
import type { NativePickedFile } from "./types.ts";

const MAX_IMAGE_BYTES = 2_500_000;
const MAX_TEXT_FILE_BYTES = 200_000;

function approxByteLengthFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  if (i < 0) return dataUrl.length;
  return Math.floor(((dataUrl.length - i - 1) * 3) / 4);
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

async function blobToText(blob: Blob): Promise<string> {
  return blob.text();
}

function isImageMime(mime: string, name: string): boolean {
  return (
    mime.startsWith("image/") ||
    /\.(heic|heif|jpe?g|png|gif|webp)$/i.test(name)
  );
}

function isTextish(mime: string, name: string): boolean {
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/csv" ||
    mime === "text/csv"
  ) {
    return true;
  }
  return /\.(txt|md|markdown|csv|json)$/i.test(name);
}

/**
 * Normalize a picked file into ChatSendAttachment.
 * Returns null if unsupported / too large / conversion failed.
 */
export async function normalizePickedFile(
  picked: NativePickedFile,
): Promise<ChatSendAttachment | null> {
  const name = picked.name || "file";
  const mime = (picked.mime || "application/octet-stream").toLowerCase();

  let blob: Blob | null = picked.blob ?? null;
  if (!blob && picked.bytes) {
    const buf =
      picked.bytes instanceof ArrayBuffer
        ? picked.bytes
        : (picked.bytes.buffer.slice(
            picked.bytes.byteOffset,
            picked.bytes.byteOffset + picked.bytes.byteLength,
          ) as ArrayBuffer);
    blob = new Blob([buf], { type: mime });
  }
  if (!blob && picked.dataUrl?.startsWith("data:")) {
    if (isImageMime(mime, name) || picked.dataUrl.startsWith("data:image/")) {
      const jpeg = await ensureJpegDataUrl(picked.dataUrl);
      if (!jpeg) return null;
      const size = approxByteLengthFromDataUrl(jpeg.url);
      if (size > MAX_IMAGE_BYTES) return null;
      return {
        id: newId("img"),
        type: "image",
        filename: name.replace(/\.\w+$/, "") + ".jpeg",
        mimeType: "image/jpeg",
        size,
        dataUrl: jpeg.url,
      };
    }
  }

  if (!blob) return null;
  if (picked.size > 0 && picked.size > MAX_IMAGE_BYTES && isImageMime(mime, name)) {
    return null;
  }

  if (isImageMime(mime, name)) {
    const file = new File([blob], name, { type: mime || "image/jpeg" });
    const image = await imageFileToAttachment(file);
    if (!image) return null;
    const dataUrl = image.url.startsWith("data:image/") ? image.url : undefined;
    if (!dataUrl) return null;
    return {
      id: newId("img"),
      type: "image",
      filename: image.name,
      mimeType: image.mime || "image/jpeg",
      size: approxByteLengthFromDataUrl(dataUrl),
      dataUrl,
    };
  }

  if (isTextish(mime, name) || mime === "application/pdf") {
    if (blob.size > MAX_TEXT_FILE_BYTES && mime !== "application/pdf") {
      return null;
    }
    let text: string | undefined;
    try {
      if (mime === "application/pdf") {
        // Preview label only — OpenAI receives actual PDF bytes via blob.
        text = `[PDF attached: ${name}]`;
      } else {
        text = await blobToText(blob);
        if (text.length > MAX_TEXT_FILE_BYTES) {
          text = text.slice(0, MAX_TEXT_FILE_BYTES);
        }
      }
    } catch {
      text = undefined;
    }
    return {
      id: newId("file"),
      type: "file",
      filename: name,
      mimeType: mime,
      size: blob.size,
      blob,
      ...(text ? { text } : {}),
    };
  }

  // Unknown binary — keep bytes for OpenAI Files upload
  return {
    id: newId("file"),
    type: "file",
    filename: name,
    mimeType: mime,
    size: blob.size,
    blob,
  };
}

export async function normalizePickedFiles(
  files: NativePickedFile[],
): Promise<ChatSendAttachment[]> {
  const out: ChatSendAttachment[] = [];
  for (const f of files) {
    const n = await normalizePickedFile(f);
    if (n) out.push(n);
  }
  return out;
}

/** Browser FileList / File[] → NativePickedFile */
export function filesToNativePicked(files: File[]): NativePickedFile[] {
  return files.map((f) => ({
    name: f.name,
    mime: f.type || "application/octet-stream",
    size: f.size,
    blob: f,
  }));
}
