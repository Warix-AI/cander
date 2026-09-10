"use client";

/**
 * Client helpers for the draft preview iframe.
 *
 * - In production the iframe runs on the project's own draft host
 *   (draft--{sub}.cander.app) via a signed session handshake, so the site
 *   behaves like a real website (cookies, forms, routing). Locally, or when
 *   the host cannot be minted, it falls back to the same-origin path proxy.
 * - The iframe stays mounted across restarts; Reload talks to the page
 *   through the injected bridge instead of remounting.
 */

export const DRAFT_PREVIEW_IFRAME_ATTR = "data-cander-draft-preview";

export type DraftBridgeMessage =
  | { type: "cander:reload" }
  | { type: "cander:navigate"; path: string }
  | { type: "cander:ping" };

export function isDraftHostSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    return /^draft--[a-z0-9-]+\.cander\.app$/i.test(new URL(src, window.location.origin).hostname);
  } catch {
    return false;
  }
}

function canUseDraftHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "cander.app" || h.endsWith(".cander.app");
}

/**
 * Pick the iframe src for a healthy preview. `previewPath` is the same-origin
 * path proxy that already passed the health probe.
 */
export async function resolveDraftIframeSrc(opts: {
  previewPath: string;
  projectId: string;
  workspaceId: string;
  currentSrc?: string | null;
}): Promise<string> {
  // Already on the draft host: keep the mounted document (no token churn).
  if (opts.currentSrc && isDraftHostSrc(opts.currentSrc)) return opts.currentSrc;
  if (!canUseDraftHost()) return opts.previewPath;
  try {
    const { createPreviewSessionClient } = await import("@/lib/api/project-sandbox-client");
    const session = await createPreviewSessionClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    if (session?.url) return session.url;
  } catch (err) {
    console.info("[cander:preview] draft host session unavailable; using path proxy", err instanceof Error ? err.message : err);
  }
  return opts.previewPath;
}

function findDraftIframe(): HTMLIFrameElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLIFrameElement>(`iframe[${DRAFT_PREVIEW_IFRAME_ATTR}]`);
}

/** Post a bridge message to the mounted draft iframe. Returns false when none. */
export function postToDraftPreview(message: DraftBridgeMessage): boolean {
  const frame = findDraftIframe();
  if (!frame?.contentWindow || !frame.src) return false;
  let origin = "*";
  try {
    origin = new URL(frame.src, window.location.origin).origin;
  } catch {
    origin = "*";
  }
  try {
    frame.contentWindow.postMessage(message, origin);
    return true;
  } catch {
    return false;
  }
}

/** In-place reload of the current page inside the iframe (state preserved by the app). */
export function reloadDraftPreview(): boolean {
  return postToDraftPreview({ type: "cander:reload" });
}
