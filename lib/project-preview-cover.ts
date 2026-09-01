import { getBrowserSurfaceAdapter } from "@/lib/browser-surface";
import { getCanderDesktopBridge } from "@/lib/desktop-shell";
import type { WorkspaceCtx } from "@/lib/space-entities";

const CAPTURE_DEBOUNCE_MS = 1200;
const MAX_COVER_CHARS = 480_000;

type CaptureTarget = {
  tabId: string;
  projectId: string;
  ctx: WorkspaceCtx;
  updateProject: (
    ctx: WorkspaceCtx,
    id: string,
    patch: { cover: string },
  ) => Promise<unknown>;
};

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Capture the active preview tab and persist a JPEG data URL on the project. */
export async function captureProjectPreviewCover({
  tabId,
  projectId,
  ctx,
  updateProject,
}: CaptureTarget) {
  const bridge = getCanderDesktopBridge()?.browser;
  if (bridge?.captureViewport) {
    const shot = await bridge.captureViewport(tabId);
    const mime = shot.mimeType ?? "image/jpeg";
    const cover = `data:${mime};base64,${shot.dataBase64}`;
    if (cover.length > MAX_COVER_CHARS) return;
    await updateProject(ctx, projectId, { cover });
    return;
  }

  const adapter = getBrowserSurfaceAdapter();
  if (adapter.id !== "capacitor") return;
  // Capacitor capture is routed through browser context providers when needed.
}

export function scheduleProjectPreviewCoverCapture(target: CaptureTarget) {
  const key = target.projectId;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void captureProjectPreviewCover(target).catch(() => {});
    }, CAPTURE_DEBOUNCE_MS),
  );
}

export function cancelProjectPreviewCoverCapture(projectId: string) {
  const prev = pending.get(projectId);
  if (prev) clearTimeout(prev);
  pending.delete(projectId);
}
