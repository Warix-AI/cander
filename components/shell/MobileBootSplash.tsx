"use client";

import { useEffect, useState } from "react";
import { CourierMark } from "@/components/brand/CourierMark";
import { isMobileShell } from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

/**
 * Covers the Capacitor WebView while the remote app hydrates / paints.
 * Native launch splash covers cold start; this covers the remote load gap.
 */
export function MobileBootSplash() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!isMobileShell()) return;
    queueMicrotask(() => setVisible(true));

    let cancelled = false;
    let fadeTimer = 0;
    let failsafe = 0;

    const dismiss = () => {
      if (cancelled) return;
      setFading(true);
      fadeTimer = window.setTimeout(() => {
        if (!cancelled) setVisible(false);
      }, 320);
    };

    const start = () => {
      // Let React paint the shell, then fade out.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.setTimeout(dismiss, 180);
        });
      });
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    failsafe = window.setTimeout(dismiss, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(fadeTimer);
      window.clearTimeout(failsafe);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-background transition-opacity duration-300 ease-out",
        fading && "opacity-0",
      )}
    >
      <CourierMark className="!h-10 !w-[42px]" tone="auto" />
    </div>
  );
}
