"use client";

import { useEffect } from "react";
import {
  decrementChromeOverlayCount,
  getBrowserSurfaceAdapter,
  incrementChromeOverlayCount,
  isChromeOverlayActive,
  resumeNativeBrowserSurfaces,
  suppressNativeBrowserSurfaces,
} from "@/lib/browser-surface";

/** Collapse native WKWebView / WebContentsView while React overlays need the front. */
export function NativeOverlayGate({ open }: { open: boolean }) {
  useEffect(() => {
    if (!open) return;
    suppressNativeBrowserSurfaces();
    const hadOverlay = isChromeOverlayActive();
    incrementChromeOverlayCount();
    const adapter = getBrowserSurfaceAdapter();
    if (!hadOverlay) {
      void adapter.setChromeOverlay?.(true);
    }
    return () => {
      resumeNativeBrowserSurfaces();
      decrementChromeOverlayCount();
      if (!isChromeOverlayActive()) {
        void adapter.setChromeOverlay?.(false);
      }
    };
  }, [open]);
  return null;
}
