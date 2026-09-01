/**
 * Save / download generated chat images across web, Electron, and Capacitor iOS.
 */

import { createNativeFiles } from "./files.ts";
import { isDesktopShell } from "../desktop-shell.ts";
import { isMobileShell } from "../mobile-shell.ts";

export type SaveImageResult = {
  ok: boolean;
  method?: "photos" | "share" | "download" | "dialog";
  error?: string;
};

type CapPhotosPlugin = {
  saveImage: (opts: {
    dataUrl: string;
    filename?: string;
  }) => Promise<{ ok?: boolean }>;
};

function getCapPhotos(): CapPhotosPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: { Plugins?: { CanderPhotos?: CapPhotosPlugin } };
    }
  ).Capacitor;
  return cap?.Plugins?.CanderPhotos ?? null;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (dataUrl.startsWith("data:")) {
    const response = await fetch(dataUrl);
    return response.blob();
  }
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid image data URL");
  const mime = m[1] || "image/png";
  const bin = atob(m[2] || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerBrowserDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function shareImageFile(
  dataUrl: string,
  filename: string,
): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    const payload: ShareData = { files: [file], title: filename };
    if (
      typeof navigator.canShare === "function" &&
      !navigator.canShare(payload)
    ) {
      return false;
    }
    await navigator.share(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a generated image:
 * - Capacitor iOS: Photos library (permission on demand), then share fallback
 * - Electron: native save dialog when available, else download
 * - Mobile/desktop web: download + share when supported
 */
export async function saveGeneratedImage(opts: {
  url: string;
  name?: string;
}): Promise<SaveImageResult> {
  const filename = (opts.name || "cander-image.png").replace(
    /[^\w.\-()+ ]+/g,
    "_",
  );
  const url = opts.url;
  if (!url?.startsWith("data:image/") && !url?.startsWith("http")) {
    return { ok: false, error: "Unsupported image URL" };
  }

  // Capacitor iOS — prefer Photos
  if (isMobileShell()) {
    const photos = getCapPhotos();
    if (photos && url.startsWith("data:")) {
      try {
        await photos.saveImage({ dataUrl: url, filename });
        return { ok: true, method: "photos" };
      } catch {
        // Fall through to share / download
      }
    }
    if (url.startsWith("data:") && (await shareImageFile(url, filename))) {
      return { ok: true, method: "share" };
    }
    try {
      triggerBrowserDownload(url, filename);
      return { ok: true, method: "download" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Save failed",
      };
    }
  }

  // Electron save dialog when we have bytes
  if (isDesktopShell() && url.startsWith("data:")) {
    try {
      const blob = await dataUrlToBlob(url);
      const buf = await blob.arrayBuffer();
      const saved = await createNativeFiles().showSaveDialog?.({
        defaultPath: filename,
        content: buf,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (saved?.ok) return { ok: true, method: "dialog" };
    } catch {
      /* fall through */
    }
  }

  try {
    if (url.startsWith("data:") && (await shareImageFile(url, filename))) {
      return { ok: true, method: "share" };
    }
    triggerBrowserDownload(url, filename);
    return { ok: true, method: "download" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Download failed",
    };
  }
}
