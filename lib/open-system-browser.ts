/**
 * Open a URL in the OS default browser (Safari / Chrome / system).
 * Use when the in-panel WebView cannot complete Cloudflare challenges or
 * other flows that need a real browser.
 */

import { getCanderDesktopBridge } from "@/lib/desktop-shell";
import { openExternalUrl } from "@/lib/mobile-shell";
import { isHttpUrl } from "@/lib/preview-url";

export function canOpenUrlInSystemBrowser(url: string | null | undefined): boolean {
  const raw = (url || "").trim();
  if (!raw || raw === "about:blank") return false;
  return isHttpUrl(raw);
}

export async function openUrlInSystemBrowser(
  url: string | null | undefined,
): Promise<boolean> {
  const raw = (url || "").trim();
  if (!canOpenUrlInSystemBrowser(raw)) return false;

  const desk = getCanderDesktopBridge()?.shell?.openExternal;
  if (typeof desk === "function") {
    try {
      await desk(raw);
      return true;
    } catch {
      /* fall through */
    }
  }

  openExternalUrl(raw);
  return true;
}
