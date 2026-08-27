"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CanderMark } from "@/components/brand/CanderMark";
import { isMobileShell } from "@/lib/mobile-shell";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  subscribeTheme,
} from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Covers the Capacitor WebView while the remote app hydrates / paints.
 * Native launch splash covers cold start; this covers the remote load gap.
 */
export function MobileBootSplash() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
  const dark = theme === "dark";
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
        "pointer-events-none fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-300 ease-out",
        dark ? "bg-black" : "bg-white",
        fading && "opacity-0",
      )}
    >
      <CanderMark
        className="!h-10 !w-[42px]"
        tone={dark ? "white" : "black"}
      />
    </div>
  );
}
