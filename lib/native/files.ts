/**
 * NativeFiles — document pick / desktop open-save-reveal / drop helpers.
 *
 * Document picker evaluation (Capacitor 7):
 * - `@capacitor/filesystem` / file-opener ≠ document selection.
 * - Maintained Cap 7 options: `@capawesome/capacitor-file-picker`, HTML
 *   `<input type="file">` (works in Cap WebViews for documents).
 * - Chose HTML input as the default Cap path (zero extra dep) with the same
 *   `NativeFiles.pickDocuments()` API; Electron uses main-process dialogs.
 * - Revisit Capawesome File Picker if multi-UTI / iCloud browsing is required.
 */

import type { ChatSendAttachment } from "../types.ts";
import { getDeviceCapabilities } from "./device.ts";
import {
  filesToNativePicked,
  normalizePickedFile,
  normalizePickedFiles,
} from "./normalize.ts";
import type { AvailabilityResult, NativePickedFile } from "./types.ts";

export type NativeFiles = {
  availability(): AvailabilityResult;
  /** HTML input / future Cap document picker / Electron dialog. */
  pickDocuments(opts?: {
    multiple?: boolean;
    accept?: string;
  }): Promise<ChatSendAttachment[]>;
  openNativeDialog?(opts?: {
    multiple?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<ChatSendAttachment[]>;
  showSaveDialog?(opts: {
    defaultPath?: string;
    content: string | ArrayBuffer;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ ok: boolean; path?: string; cancelled?: boolean }>;
  revealInFolder?(path: string): Promise<{ ok: boolean }>;
  fromDataTransfer(dt: DataTransfer): Promise<ChatSendAttachment[]>;
};

function pickViaHtmlInput(opts?: {
  multiple?: boolean;
  accept?: string;
}): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve([]);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = Boolean(opts?.multiple);
    if (opts?.accept) input.accept = opts.accept;
    input.style.display = "none";
    input.onchange = () => {
      const list = input.files ? Array.from(input.files) : [];
      input.remove();
      resolve(list);
    };
    input.oncancel = () => {
      input.remove();
      resolve([]);
    };
    document.body.appendChild(input);
    input.click();
  });
}

type DesktopFilesBridge = {
  showOpenDialog?: (opts: Record<string, unknown>) => Promise<{
    cancelled?: boolean;
    files?: Array<{
      name: string;
      mime: string;
      size: number;
      dataBase64?: string;
      text?: string;
      pathHandle?: string;
    }>;
  }>;
  showSaveDialog?: (opts: Record<string, unknown>) => Promise<{
    ok: boolean;
    path?: string;
    cancelled?: boolean;
  }>;
  revealInFolder?: (path: string) => Promise<{ ok: boolean }>;
};

function getDesktopFiles(): DesktopFilesBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (
    window as Window & {
      canderDesktop?: { files?: DesktopFilesBridge };
    }
  ).canderDesktop;
  return bridge?.files ?? null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createNativeFiles(): NativeFiles {
  return {
    availability() {
      return getDeviceCapabilities().files;
    },

    async pickDocuments(opts) {
      const desktop = getDesktopFiles();
      if (desktop?.showOpenDialog) {
        return this.openNativeDialog!({
          multiple: opts?.multiple,
        });
      }
      const files = await pickViaHtmlInput({
        multiple: opts?.multiple ?? true,
        accept: opts?.accept,
      });
      return normalizePickedFiles(filesToNativePicked(files));
    },

    async openNativeDialog(opts) {
      const desktop = getDesktopFiles();
      if (!desktop?.showOpenDialog) {
        return this.pickDocuments({ multiple: opts?.multiple });
      }
      const res = await desktop.showOpenDialog({
        multiple: opts?.multiple ?? true,
        filters: opts?.filters,
      });
      if (res.cancelled || !res.files?.length) return [];
      const picked: NativePickedFile[] = res.files.map((f) => ({
        name: f.name,
        mime: f.mime,
        size: f.size,
        authorizedPathHandle: f.pathHandle,
        bytes: f.dataBase64 ? base64ToBytes(f.dataBase64) : undefined,
      }));
      // Always normalize to ChatSendAttachment with actual bytes (no path-only).
      const out: ChatSendAttachment[] = [];
      for (let i = 0; i < picked.length; i++) {
        const n = await normalizePickedFile(picked[i]!);
        if (!n) continue;
        const src = res.files[i]!;
        if (src.text && n.type === "file" && !n.text) {
          n.text = src.text;
        }
        out.push(n);
      }
      return out;
    },

    async showSaveDialog(opts) {
      const desktop = getDesktopFiles();
      if (!desktop?.showSaveDialog) {
        return { ok: false };
      }
      let contentBase64: string | undefined;
      let contentText: string | undefined;
      if (typeof opts.content === "string") {
        contentText = opts.content;
      } else {
        const bytes = new Uint8Array(opts.content);
        let s = "";
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
        contentBase64 = btoa(s);
      }
      return desktop.showSaveDialog({
        defaultPath: opts.defaultPath,
        contentText,
        contentBase64,
        filters: opts.filters,
      });
    },

    async revealInFolder(path) {
      const desktop = getDesktopFiles();
      if (!desktop?.revealInFolder) return { ok: false };
      return desktop.revealInFolder(path);
    },

    async fromDataTransfer(dt) {
      const files = dt.files ? Array.from(dt.files) : [];
      return normalizePickedFiles(filesToNativePicked(files));
    },
  };
}
