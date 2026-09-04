import { getBrowserSurfaceAdapter, canEmbedInPwa } from "@/lib/browser-surface";
import {
  enterBrowserPip,
  exitBrowserPip,
  getBrowserPipSnapshot,
  DEFAULT_PIP_HEIGHT,
  DEFAULT_PIP_WIDTH,
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
  input: Omit<BrowserPipState, "webEmbed" | "width" | "height"> & {
    webEmbed?: boolean;
    width?: number;
    height?: number;
  },
): Promise<boolean> {
  const gate = canEnterBrowserPip(input.url);
  if (!gate.ok) return false;

  const prev = getBrowserPipSnapshot();
  const adapter = getBrowserSurfaceAdapter();

  if (prev?.tabId === input.tabId) {
    if (!prev.webEmbed) {
      await adapter.setPipTab?.(input.tabId);
    }
    return true;
  }

  // Release prior PiP without destroying — tab strip may still own that session.
  if (prev && prev.tabId !== input.tabId) {
    exitBrowserPip();
    if (!prev.webEmbed) {
      await adapter.setPipTab?.(null);
      await adapter.hideTab(prev.tabId);
    }
  }

  const webEmbed = input.webEmbed ?? gate.webEmbed;
  enterBrowserPip({
    ...input,
    webEmbed,
    width: input.width ?? prev?.width ?? DEFAULT_PIP_WIDTH,
    height: input.height ?? prev?.height ?? DEFAULT_PIP_HEIGHT,
  });

  if (!webEmbed) {
    await adapter.setPipTab?.(input.tabId);
  }
  return true;
}

/** Exit PiP chrome. Destroy native tab only when the tab is being closed. */
export async function stopBrowserPip(opts?: {
  destroy?: boolean;
}): Promise<void> {
  const prev = getBrowserPipSnapshot();
  exitBrowserPip();
  if (!prev || prev.webEmbed) return;
  const adapter = getBrowserSurfaceAdapter();
  await adapter.setPipTab?.(null);
  if (opts?.destroy) {
    await adapter.destroyTab(prev.tabId);
  } else {
    await adapter.hideTab(prev.tabId);
  }
}
