/**
 * MIME + size limits for raw OpenAI multimodal uploads.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_ATTACHMENTS_PER_TURN = 8;

export const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/m4a",
  "audio/mp3",
]);

export type AttachmentKind = "image" | "document" | "audio";

export function normalizeMime(mime: string | null | undefined): string {
  return (mime || "").split(";")[0]?.trim().toLowerCase() || "";
}

export function inferAttachmentKind(
  mime: string,
  hint?: string | null,
): AttachmentKind | null {
  const m = normalizeMime(mime);
  const h = (hint || "").toLowerCase();
  if (h === "image" || IMAGE_MIMES.has(m)) return "image";
  if (h === "audio" || AUDIO_MIMES.has(m)) return "audio";
  if (h === "document" || h === "file" || DOCUMENT_MIMES.has(m)) return "document";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  return null;
}

export function maxBytesForKind(kind: AttachmentKind): number {
  if (kind === "image") return MAX_IMAGE_BYTES;
  if (kind === "audio") return MAX_AUDIO_BYTES;
  return MAX_DOCUMENT_BYTES;
}

export function validateUpload(opts: {
  mime: string;
  size: number;
  hint?: string | null;
}): { ok: true; kind: AttachmentKind } | { ok: false; error: string } {
  const kind = inferAttachmentKind(opts.mime, opts.hint);
  if (!kind) {
    return {
      ok: false,
      error: `Unsupported file type: ${normalizeMime(opts.mime) || "unknown"}.`,
    };
  }
  const max = maxBytesForKind(kind);
  if (opts.size <= 0) {
    return { ok: false, error: "Empty file." };
  }
  if (opts.size > max) {
    return {
      ok: false,
      error: `File too large (max ${Math.round(max / (1024 * 1024))} MB for ${kind}).`,
    };
  }
  const m = normalizeMime(opts.mime);
  if (kind === "image" && !IMAGE_MIMES.has(m) && m !== "image/jpg") {
    // allow image/jpg alias already in set; reject other image/*
    if (!IMAGE_MIMES.has(m)) {
      return { ok: false, error: `Unsupported image type: ${m}.` };
    }
  }
  if (kind === "document" && !DOCUMENT_MIMES.has(m)) {
    return { ok: false, error: `Unsupported document type: ${m}.` };
  }
  if (kind === "audio" && !AUDIO_MIMES.has(m)) {
    return { ok: false, error: `Unsupported audio type: ${m}.` };
  }
  return { ok: true, kind };
}

/** Composer menu actions by platform (for UI + tests). */
export type ComposerAttachAction =
  | "take_photo"
  | "choose_photo"
  | "upload_file"
  | "upload";

export function composerAttachActions(opts: {
  nativeCapacitor: boolean;
  mobileShell: boolean;
}): ComposerAttachAction[] {
  if (opts.nativeCapacitor || opts.mobileShell) {
    return ["take_photo", "choose_photo", "upload_file"];
  }
  // Desktop: one picker for images + documents
  return ["upload"];
}
