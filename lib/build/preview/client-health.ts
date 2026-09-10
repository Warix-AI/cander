/**
 * Client-side draft preview probe — refuse to show blank/broken Next error pages.
 */

import {
  assessPreviewHealth,
  formatDraftFailedMessage,
} from "@/lib/build/preview/health";
import { RUNTIME_STATE_COPY } from "@/lib/build/sandbox/constants";

export type ApplyDraftPreviewResult =
  | { ok: true; previewSrc: string }
  | {
      ok: false;
      message: string;
      status?: number | null;
      /**
       * The upstream sandbox is gone or restarting (410 Gone, 502/503/504, or
       * no response). A fresh ensure() brings the draft back — this is not a
       * broken site.
       */
      recoverable?: boolean;
    };

const RECOVERABLE_STATUSES = new Set([0, 404, 410, 502, 503, 504]);

export async function probeDraftPreviewPath(
  previewPath: string,
  opts?: { bustCache?: boolean },
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
      // Diagnostics go to the console; the user sees state copy only.
      console.info("[cander:preview] probe unhealthy", {
        status: probeRes.status,
        reason: formatDraftFailedMessage(health.reason || "Preview returned an error."),
      });
      return {
        ok: false,
        status: probeRes.status,
        recoverable: RECOVERABLE_STATUSES.has(probeRes.status),
        message: RUNTIME_STATE_COPY.needs_retry,
      };
    }
    // Keep the src stable across probes so a remounted (or re-probed) draft
    // tab does not hard-reload the iframe. Cache-bust only on explicit reload.
    const previewSrc = opts?.bustCache
      ? `${previewPath}${join}_r=${Date.now()}`
      : previewPath;
    return { ok: true, previewSrc };
  } catch (err) {
    console.info("[cander:preview] probe failed", err instanceof Error ? err.message : err);
    return {
      ok: false,
      status: null,
      recoverable: true,
      message: RUNTIME_STATE_COPY.starting,
    };
  }
}
