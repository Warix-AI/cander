/**
 * Composer attach helpers — Cap Camera/Photos on native; file inputs on web.
 */

import type { ChatFileAttachment, ChatImageAttachment } from "@/lib/types";
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
  files: ChatFileAttachment[];
}> {
  const picked = list ? [...list] : [];
  const images: ChatImageAttachment[] = [];
  const files: ChatFileAttachment[] = [];

  for (const file of picked.slice(0, 8)) {
    if (file.type.startsWith("image/")) {
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
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'post-fix',hypothesisId:'A',location:'composer-attach.ts:webPathToAttachment',message:'fetch webPath result',data:{webPathPrefix:webPath.slice(0,80),srcPrefix:src.slice(0,80),ok:res.ok,status:res.status,blobSize:blob.size,blobType:blob.type||'empty',overMax:blob.size>MAX_IMAGE_BYTES},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (blob.size > MAX_IMAGE_BYTES) return null;
    const file = new File([blob], name, {
      type: blob.type || "image/jpeg",
    });
    return imageFileToAttachment(file);
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'post-fix',hypothesisId:'A',location:'composer-attach.ts:webPathToAttachment',message:'fetch webPath threw',data:{webPathPrefix:webPath.slice(0,80),err:err instanceof Error?err.message:String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return null;
  }
}

export type CapImagePickResult =
  | { ok: true; image: ChatImageAttachment }
  | { ok: false; cancelled?: boolean; message: string; debug?: string };

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel|cancelled|canceled|user denied|No image picked/i.test(msg);
}

function failPick(
  message: string,
  debug: Record<string, unknown>,
  cancelled?: boolean,
): CapImagePickResult {
  const token = Object.entries(debug)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("|");
  // #region agent log
  fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'post-fix',hypothesisId:'A',location:'composer-attach.ts:failPick',message,data:debug,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return {
    ok: false,
    cancelled,
    message: `${message} [${token}]`,
    debug: token,
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

    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'post-fix',hypothesisId:'B',location:'composer-attach.ts:getPhoto',message:'Camera.getPhoto raw result',data:{source,hasWebPath:Boolean(photo.webPath),hasDataUrl:Boolean(photo.dataUrl),dataUrlLen:photo.dataUrl?.length??0,hasBase64:Boolean(photo.base64String),base64Len:photo.base64String?.length??0,format:photo.format??null,keys:Object.keys(photo||{})},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const name = source === "camera" ? "camera.jpeg" : "photo.jpeg";
    const fromInline = photoToAttachment(photo, name);
    if (fromInline) {
      // #region agent log
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'post-fix',hypothesisId:'B',location:'composer-attach.ts:getPhoto',message:'base64/dataUrl attach ok',data:{source,name,urlLen:fromInline.url.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return { ok: true, image: fromInline };
    }

    const path = photo.webPath || photo.path;
    if (path) {
      const image = await webPathToAttachment(path, name);
      if (image) return { ok: true, image };
    }

    return failPick("No image returned from the camera.", {
      path: "getPhoto",
      source,
      keys: Object.keys(photo || {}).join(","),
      hasWebPath: Boolean(photo.webPath),
      hasDataUrl: Boolean(photo.dataUrl),
      hasBase64: Boolean(photo.base64String),
    });
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
