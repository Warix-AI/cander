/**
 * Composer attach helpers — Cap Camera/Photos on native; file inputs on web.
 */

import type { ChatImageAttachment } from "@/lib/types";
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
    format?: string;
  }>;
  pickImages?: (opts: Record<string, unknown>) => Promise<{
    photos: Array<{ webPath?: string; format?: string }>;
  }>;
  requestPermissions?: (opts?: {
    permissions?: Array<"camera" | "photos">;
  }) => Promise<{ camera?: string; photos?: string }>;
  checkPermissions?: () => Promise<{ camera?: string; photos?: string }>;
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

export async function imageFileToAttachment(
  file: File,
): Promise<ChatImageAttachment | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > MAX_IMAGE_BYTES) return null;
  try {
    const url = await fileToDataUrl(file);
    return {
      url,
      name: file.name || "image.png",
      mime: file.type || "image/png",
    };
  } catch {
    return null;
  }
}

export async function filesFromList(
  list: FileList | File[] | null,
): Promise<{
  images: ChatImageAttachment[];
  fileNames: string[];
  textSnippets: string[];
}> {
  const files = list ? [...list] : [];
  const images: ChatImageAttachment[] = [];
  const fileNames: string[] = [];
  const textSnippets: string[] = [];

  for (const file of files.slice(0, 8)) {
    if (file.type.startsWith("image/")) {
      const att = await imageFileToAttachment(file);
      if (att) images.push(att);
      continue;
    }
    fileNames.push(file.name);
    if (
      (file.type.startsWith("text/") ||
        /\.(md|markdown|txt|csv|json)$/i.test(file.name)) &&
      file.size <= MAX_TEXT_FILE_BYTES
    ) {
      try {
        const text = await file.text();
        if (text.trim()) {
          textSnippets.push(
            `[Attached file “${file.name}”]\n${text.trim().slice(0, 12_000)}`,
          );
        }
      } catch {
        /* keep name-only */
      }
    }
  }

  return {
    images: images.slice(0, 4),
    fileNames: fileNames.slice(0, 6),
    textSnippets,
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

async function webPathToAttachment(
  webPath: string,
  name: string,
): Promise<ChatImageAttachment | null> {
  try {
    const res = await fetch(webPath);
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

    // Prefer Uri + fetch — huge dataUrls have crashed WKWebView.
    if (source === "photos" && Camera.pickImages) {
      const gallery = await Camera.pickImages({
        quality: 70,
        limit: 1,
      });
      const first = gallery.photos?.[0];
      if (!first?.webPath) {
        return { ok: false, cancelled: true, message: "No photo selected." };
      }
      const image = await webPathToAttachment(first.webPath, "photo.jpeg");
      if (!image) {
        return { ok: false, message: "Couldn’t read that photo." };
      }
      return { ok: true, image };
    }

    const photo = await Camera.getPhoto({
      quality: 70,
      width: 1600,
      allowEditing: false,
      saveToGallery: false,
      // Uri keeps memory lower than dataUrl on device.
      resultType: "uri",
      source: source === "camera" ? "CAMERA" : "PHOTOS",
    });

    if (photo.webPath) {
      const image = await webPathToAttachment(
        photo.webPath,
        source === "camera" ? "camera.jpeg" : "photo.jpeg",
      );
      if (image) return { ok: true, image };
    }

    if (photo.dataUrl) {
      const image = dataUrlToAttachment(
        photo.dataUrl,
        source === "camera" ? "camera.jpeg" : "photo.jpeg",
      );
      if (image) return { ok: true, image };
    }

    if (photo.base64String) {
      const mime = `image/${photo.format || "jpeg"}`;
      const image = dataUrlToAttachment(
        `data:${mime};base64,${photo.base64String}`,
        source === "camera" ? "camera.jpeg" : "photo.jpeg",
      );
      if (image) return { ok: true, image };
    }

    return { ok: false, message: "No image returned from the camera." };
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
