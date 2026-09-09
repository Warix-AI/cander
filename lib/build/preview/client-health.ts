/**
 * Client-side draft preview probe — refuse to show blank/broken Next error pages.
 */

import {
  assessPreviewHealth,
  formatDraftFailedMessage,
} from "@/lib/build/preview/health";

export type ApplyDraftPreviewResult =
  | { ok: true; previewSrc: string }
  | { ok: false; message: string };

export async function probeDraftPreviewPath(
  previewPath: string,
): Promise<ApplyDraftPreviewResult> {
  try {
    const join = previewPath.includes("?") ? "&" : "?";
    const probeRes = await fetch(`${previewPath}${join}_health=1`, {
      method: "GET",
      credentials: "include",
    });
    const probeBody = await probeRes.text().catch(() => "");
    const health = assessPreviewHealth({
      status: probeRes.status,
      bodyText: probeBody.slice(0, 8000),
    });
    if (!health.ok) {
      return {
        ok: false,
        message: formatDraftFailedMessage(
          health.reason || "Preview returned an error.",
        ),
      };
    }
    return { ok: true, previewSrc: `${previewPath}?_r=${Date.now()}` };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Draft failed to start: ${err.message}`
          : "Draft failed to start: preview probe failed.",
    };
  }
}
