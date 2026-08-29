/**
 * Composer attach helpers — Cap Camera/Photos on native; file inputs on web.
 */

import type {
  ChatFileAttachment,
  ChatImageAttachment,
  ChatSendAttachment,
} from "@/lib/types";
import { isMobileShell } from "@/lib/mobile-shell";

const MAX_IMAGE_BYTES = 2_500_000;
const MAX_TEXT_FILE_BYTES = 200_000;

export const DOCUMENT_ACCEPT =
  ".pdf,.txt,.md,.markdown,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,text/markdown,application/pdf";

export function isCapacitorNative(): boolean {
  return isMobileShell();
}

type CapCameraPlugin = {
  getPhoto: (opts: Record<string, unknown>) => Promise<{
    dataUrl?: string;
    base64String?: string;
    webPath?: string;
    path?: string;
    format?: string;
  }>;
  pickImages?: (opts: Record<string, unknown>) => Promise<{
    photos: Array<{
      webPath?: string;
      path?: string;
      format?: string;
      dataUrl?: string;
      base64String?: string;
    }>;
  }>;
  requestPermissions?: (opts?: {
    permissions?: Array<"camera" | "photos">;
  }) => Promise<{ camera?: string; photos?: string }>;
};

function getCapCamera(): CapCameraPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as Window & {
      Capacitor?: { Plugins?: { Camera?: CapCameraPlugin } };
    }
  ).Capacitor;
  const Camera = cap?.Plugins?.Camera;
  return Camera?.getPhoto ? Camera : null;
}

function approxByteLengthFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  if (i < 0) return dataUrl.length;
  return Math.floor(((dataUrl.length - i - 1) * 3) / 4);
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read failed"));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Convert HEIC/HEIF (or other) data URLs to JPEG for vision models. */
export async function ensureJpegDataUrl(
  dataUrl: string,
): Promise<{ url: string; mime: string } | null> {
  if (!dataUrl.startsWith("data:image/")) return null;
  const mimeMatch = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);/i);
  const mime = (mimeMatch?.[1] || "image/jpeg").toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png") {
    return { url: dataUrl, mime: mime === "image/jpg" ? "image/jpeg" : mime };
  }
  if (typeof document === "undefined") {
    // Can't decode HEIC without DOM/canvas.
    return null;
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.width, img.height, 1));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL("image/jpeg", 0.85);
    if (!jpeg.startsWith("data:image/jpeg")) return null;
    return { url: jpeg, mime: "image/jpeg" };
  } catch {
    return null;
  }
}

function logImageSelected(data: Record<string, unknown>) {
  console.log("[IMAGE_SELECTED]", data);
}

export async function imageFileToAttachment(
  file: File,
): Promise<ChatImageAttachment | null> {
  if (!file.type.startsWith("image/") && !/\.heic$/i.test(file.name)) {
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) return null;
  try {
    const rawUrl = await fileToDataUrl(file);
    const converted = await ensureJpegDataUrl(rawUrl);
    if (!converted) {
      logImageSelected({
        filename: file.name,
        mimeType: file.type || "unknown",
        size: file.size,
        source: "file",
        ok: false,
        reason: "convert_failed",
      });
      return null;
    }
    if (approxByteLengthFromDataUrl(converted.url) > MAX_IMAGE_BYTES) {
      return null;
    }
    logImageSelected({
      filename: file.name || "image.jpeg",
      mimeType: converted.mime,
      size: approxByteLengthFromDataUrl(converted.url),
      source: "file",
      ok: true,
    });
    return {
      url: converted.url,
      name: (file.name || "image.jpeg").replace(/\.heic$/i, ".jpeg"),
      mime: converted.mime,
    };
  } catch {
    return null;
  }
}

export async function filesFromList(
  list: FileList | File[] | null,
): Promise<{
  images: ChatImageAttachment[];
  files: ChatFileAttachment[];
}> {
  const picked = list ? [...list] : [];
  const images: ChatImageAttachment[] = [];
  const files: ChatFileAttachment[] = [];

  for (const file of picked.slice(0, 8)) {
    if (file.type.startsWith("image/") || /\.heic$/i.test(file.name)) {
      const att = await imageFileToAttachment(file);
      if (att) images.push(att);
      continue;
    }
    let text: string | undefined;
    if (
      (file.type.startsWith("text/") ||
        /\.(md|markdown|txt|csv|json)$/i.test(file.name)) &&
      file.size <= MAX_TEXT_FILE_BYTES
    ) {
      try {
        const raw = await file.text();
        if (raw.trim()) text = raw.trim().slice(0, 12_000);
      } catch {
        /* name-only */
      }
    }
    files.push({ name: file.name, ...(text ? { text } : {}) });
  }

  return {
    images: images.slice(0, 4),
    files: files.slice(0, 6),
  };
}

function dataUrlToAttachment(
  dataUrl: string,
  name: string,
): ChatImageAttachment | null {
  if (!dataUrl.startsWith("data:image/")) return null;
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg";
  return { url: dataUrl, name, mime };
}

function base64ToAttachment(
  base64: string,
  format: string | undefined,
  name: string,
): ChatImageAttachment | null {
  const ext = (format || "jpeg").replace(/^\./, "");
  const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
  return dataUrlToAttachment(`data:${mime};base64,${base64}`, name);
}

async function webPathToAttachment(
  webPath: string,
  name: string,
): Promise<ChatImageAttachment | null> {
  try {
    const cap = (
      window as Window & {
        Capacitor?: { convertFileSrc?: (path: string) => string };
      }
    ).Capacitor;
    const src = cap?.convertFileSrc?.(webPath) ?? webPath;
    const res = await fetch(src);
    const blob = await res.blob();
    if (blob.size > MAX_IMAGE_BYTES) return null;
    const file = new File([blob], name, {
      type: blob.type || "image/jpeg",
    });
    return imageFileToAttachment(file);
  } catch {
    return null;
  }
}

export type CapImagePickResult =
  | { ok: true; image: ChatImageAttachment }
  | { ok: false; cancelled?: boolean; message: string };

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel|cancelled|canceled|user denied|No image picked/i.test(msg);
}

async function finalizeImageAttachment(
  image: ChatImageAttachment,
  source: string,
): Promise<ChatImageAttachment | null> {
  const converted = await ensureJpegDataUrl(image.url);
  if (!converted) {
    logImageSelected({
      filename: image.name,
      mimeType: image.mime,
      size: approxByteLengthFromDataUrl(image.url),
      source,
      ok: false,
      reason: "heic_or_decode_failed",
    });
    return null;
  }
  const size = approxByteLengthFromDataUrl(converted.url);
  logImageSelected({
    filename: image.name,
    mimeType: converted.mime,
    size,
    source,
    ok: true,
  });
  return {
    url: converted.url,
    name: image.name.replace(/\.heic$/i, ".jpeg"),
    mime: converted.mime,
  };
}

function photoToAttachment(
  photo: {
    dataUrl?: string;
    base64String?: string;
    webPath?: string;
    path?: string;
    format?: string;
  },
  name: string,
): ChatImageAttachment | null {
  if (photo.dataUrl) {
    const image = dataUrlToAttachment(photo.dataUrl, name);
    if (image) return image;
  }
  if (photo.base64String) {
    const image = base64ToAttachment(photo.base64String, photo.format, name);
    if (image) return image;
  }
  return null;
}

/** Native-only: Camera or Photos via @capacitor/camera (never HTML file input). */
export async function pickWithCapacitorCamera(
  source: "camera" | "photos",
): Promise<CapImagePickResult> {
  if (!isCapacitorNative()) {
    return { ok: false, message: "Camera is only available in the Cander app." };
  }
  const Camera = getCapCamera();
  if (!Camera) {
    return {
      ok: false,
      message:
        "Camera plugin isn’t installed in this build. Sync the mobile app and rebuild.",
    };
  }

  try {
    if (Camera.requestPermissions) {
      const perms = await Camera.requestPermissions({
        permissions: source === "camera" ? ["camera"] : ["photos"],
      });
      const key = source === "camera" ? perms.camera : perms.photos;
      if (key === "denied") {
        return {
          ok: false,
          message:
            source === "camera"
              ? "Camera permission was denied. Enable it in Settings."
              : "Photos permission was denied. Enable it in Settings.",
        };
      }
    }

    // Remote Cap WebView (https://cander.app) cannot reliably fetch capacitor://
    // file URIs — use base64 so the image lands in JS without fetch.
    const photo = await Camera.getPhoto({
      quality: 60,
      width: 1280,
      allowEditing: false,
      saveToGallery: false,
      resultType: "base64",
      source: source === "camera" ? "CAMERA" : "PHOTOS",
    });

    const name = source === "camera" ? "camera.jpeg" : "photo.jpeg";
    const fromInline = photoToAttachment(photo, name);
    if (fromInline) {
      const finalized = await finalizeImageAttachment(fromInline, source);
      if (finalized) return { ok: true, image: finalized };
      return {
        ok: false,
        message:
          "Couldn’t convert that photo for the AI (HEIC may be unsupported). Try a screenshot or JPEG.",
      };
    }

    const path = photo.webPath || photo.path;
    if (path) {
      const image = await webPathToAttachment(path, name);
      if (image) return { ok: true, image };
    }

    logImageSelected({
      filename: name,
      mimeType: photo.format || "unknown",
      size: 0,
      source,
      ok: false,
      reason: "no_bytes",
    });
    return {
      ok: false,
      message: "No image returned from the camera.",
    };
  } catch (err) {
    if (isUserCancel(err)) {
      return { ok: false, cancelled: true, message: "Cancelled." };
    }
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Couldn’t open camera or photos.",
    };
  }
}

export function toSendAttachments(
  images: ChatImageAttachment[],
  files: ChatFileAttachment[],
): ChatSendAttachment[] {
  const out: ChatSendAttachment[] = [];
  for (const img of images) {
    const dataUrl = img.url.startsWith("data:image/") ? img.url : undefined;
    out.push({
      id: `img_${Math.random().toString(36).slice(2, 10)}`,
      type: "image",
      filename: img.name,
      mimeType: img.mime || "image/jpeg",
      size: dataUrl ? approxByteLengthFromDataUrl(dataUrl) : 0,
      ...(dataUrl ? { dataUrl } : {}),
    });
  }
  for (const f of files) {
    out.push({
      id: `file_${Math.random().toString(36).slice(2, 10)}`,
      type: "file",
      filename: f.name,
      mimeType: "text/plain",
      size: f.text?.length ?? 0,
      ...(f.text ? { text: f.text } : {}),
    });
  }
  return out;
}
