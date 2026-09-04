import { getBrowserSurfaceAdapter, canEmbedInPwa } from "@/lib/browser-surface";
import {
  enterBrowserPip,
  exitBrowserPip,
  getBrowserPipSnapshot,
  type BrowserPipState,
} from "@/lib/browser-pip-store";
import { hasDesktopBrowserBridge, isDesktopShell } from "@/lib/desktop-shell";

export function canEnterBrowserPip(url: string): {
  ok: boolean;
  webEmbed: boolean;
  reason?: string;
} {
  const trimmed = url.trim();
  if (!trimmed || trimmed === "about:blank") {
    return { ok: false, webEmbed: false, reason: "Open a page first" };
  }
  const desktop =
    typeof window !== "undefined" &&
    isDesktopShell() &&
    hasDesktopBrowserBridge();
  if (desktop) {
    return { ok: true, webEmbed: false };
  }
  if (canEmbedInPwa(trimmed, false)) {
    return { ok: true, webEmbed: true };
  }
  return {
    ok: false,
    webEmbed: false,
    reason: "Available in the desktop app",
  };
}

/** Start PiP for a live browser tab. Replaces any existing PiP. */
export async function startBrowserPip(
  input: Omit<BrowserPipState, "webEmbed"> & { webEmbed?: boolean },
): Promise<boolean> {
  const gate = canEnterBrowserPip(input.url);
  if (!gate.ok) return false;

  const prev = getBrowserPipSnapshot();
  const adapter = getBrowserSurfaceAdapter();

  if (prev && prev.tabId !== input.tabId) {
    exitBrowserPip();
    if (!prev.webEmbed) {
      await adapter.setPipTab?.(null);
      await adapter.destroyTab(prev.tabId);
    }
  }

  const webEmbed = input.webEmbed ?? gate.webEmbed;
  enterBrowserPip({
    ...input,
    webEmbed,
  });

  if (!webEmbed) {
    await adapter.setPipTab?.(input.tabId);
  }
  return true;
}

export async function stopBrowserPip(): Promise<void> {
  const prev = getBrowserPipSnapshot();
  exitBrowserPip();
  if (!prev || prev.webEmbed) return;
  const adapter = getBrowserSurfaceAdapter();
  await adapter.setPipTab?.(null);
  await adapter.destroyTab(prev.tabId);
}
