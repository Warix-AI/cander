"use client";

import { useEffect } from "react";
import {
  getBrowserSurfaceAdapter,
  resumeNativeBrowserSurfaces,
  suppressNativeBrowserSurfaces,
} from "@/lib/browser-surface";

/** Collapse native WKWebView / WebContentsView while React overlays need the front. */
export function NativeOverlayGate({ open }: { open: boolean }) {
  useEffect(() => {
    if (!open) return;
    suppressNativeBrowserSurfaces();
    const adapter = getBrowserSurfaceAdapter();
    void adapter.setChromeOverlay?.(true);
    return () => {
      resumeNativeBrowserSurfaces();
      void adapter.setChromeOverlay?.(false);
    };
  }, [open]);
  return null;
}
