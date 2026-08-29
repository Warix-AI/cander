/**
 * Composer attach helpers — Camera / Photos / Files with Cap + web fallbacks.
 */

import type { ChatImageAttachment } from "@/lib/types";

const MAX_IMAGE_BYTES = 2_500_000;
const MAX_TEXT_FILE_BYTES = 200_000;

export const DOCUMENT_ACCEPT =
  ".pdf,.txt,.md,.markdown,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,text/markdown,application/pdf";

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
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
  const mime =
    dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg";
  return { url: dataUrl, name, mime };
}

/** Cap Camera plugin when native; otherwise null (caller uses file input). */
export async function pickWithCapacitorCamera(
  source: "camera" | "photos",
): Promise<ChatImageAttachment | null> {
  if (!isCapacitorNative()) return null;
  try {
    const cap = (
      window as Window & {
        Capacitor?: {
          Plugins?: {
            Camera?: {
              getPhoto: (opts: Record<string, unknown>) => Promise<{
                dataUrl?: string;
                format?: string;
              }>;
            };
          };
        };
      }
    ).Capacitor;
    const Camera = cap?.Plugins?.Camera;
    if (!Camera?.getPhoto) return null;
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: "dataUrl",
      source: source === "camera" ? "CAMERA" : "PHOTOS",
    });
    const dataUrl = photo.dataUrl;
    if (!dataUrl) return null;
    const ext = photo.format || "jpeg";
    return dataUrlToAttachment(
      dataUrl,
      source === "camera" ? `camera.${ext}` : `photo.${ext}`,
    );
  } catch {
    return null;
  }
}

export { isCapacitorNative };
