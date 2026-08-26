"use client";

import { useEffect, useState } from "react";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function getCapacitor(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

/** True when the UI is running inside the Cander Capacitor shell. */
export function isMobileShell() {
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) return true;
  if (typeof navigator === "undefined") return false;
  return /\bCapacitor\b/i.test(navigator.userAgent);
}

export function getMobilePlatform(): "ios" | "android" | "web" {
  const cap = getCapacitor();
  const platform = cap?.getPlatform?.();
  if (platform === "ios" || platform === "android") return platform;
  return "web";
}

/**
 * Lock the document against pinch-zoom / rubber-band scroll when the
 * soft keyboard opens. Keeps the composer docked above the keyboard.
 */
export function lockMobileViewport() {
  const root = document.documentElement;
  const sync = () => {
    const vv = window.visualViewport;
    const height = vv?.height ?? window.innerHeight;
    const offset = vv?.offsetTop ?? 0;
    root.style.setProperty("--vvh", `${height}px`);
    root.style.setProperty("--vv-offset", `${offset}px`);
    // Kill iOS scroll-into-view jitter when focusing inputs.
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };

  sync();
  const vv = window.visualViewport;
  vv?.addEventListener("resize", sync);
  vv?.addEventListener("scroll", sync);
  window.addEventListener("focusin", sync);

  const blockZoom = (event: Event) => {
    event.preventDefault();
  };
  // Safari gesture events (non-standard)
  document.addEventListener("gesturestart", blockZoom, { passive: false } as AddEventListenerOptions);
  document.addEventListener("gesturechange", blockZoom, { passive: false } as AddEventListenerOptions);
  document.addEventListener("gestureend", blockZoom, { passive: false } as AddEventListenerOptions);

  return () => {
    vv?.removeEventListener("resize", sync);
    vv?.removeEventListener("scroll", sync);
    window.removeEventListener("focusin", sync);
    document.removeEventListener("gesturestart", blockZoom);
    document.removeEventListener("gesturechange", blockZoom);
    document.removeEventListener("gestureend", blockZoom);
    root.style.removeProperty("--vvh");
    root.style.removeProperty("--vv-offset");
  };
}

/** Client hook — false on the server / in a normal browser. */
export function useMobileShell() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const on = isMobileShell();
    setMobile(on);
    if (!on) return;
    document.documentElement.classList.add("cander-mobile");
    document.documentElement.dataset.canderMobile = getMobilePlatform();
    const unlock = lockMobileViewport();
    return () => {
      unlock();
      document.documentElement.classList.remove("cander-mobile");
      delete document.documentElement.dataset.canderMobile;
    };
  }, []);
  return mobile;
}
