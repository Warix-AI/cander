"use client";

import { useEffect, useState } from "react";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    Keyboard?: {
      setAccessoryBarVisible?: (opts: { isVisible: boolean }) => Promise<void>;
      setScroll?: (opts: { isDisabled: boolean }) => Promise<void>;
    };
  };
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

/** Hide iOS form accessory (↑↓ / Done) when Capacitor Keyboard is available. */
async function hideKeyboardAccessory() {
  try {
    const keyboard = getCapacitor()?.Plugins?.Keyboard;
    await keyboard?.setAccessoryBarVisible?.({ isVisible: false });
    await keyboard?.setScroll?.({ isDisabled: true });
  } catch {
    // Plugin optional — accessory also fixed by keeping file inputs out of <form>.
  }
}

/**
 * Prevent pinch-zoom / document scroll. Do NOT resize the shell around the
 * keyboard — that shoved the composer off-screen.
 */
export function lockMobileViewport() {
  const root = document.documentElement;
  void hideKeyboardAccessory();

  const keepTop = () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };

  keepTop();
  const vv = window.visualViewport;
  vv?.addEventListener("resize", keepTop);
  vv?.addEventListener("scroll", keepTop);
  window.addEventListener("focusin", keepTop);

  const blockZoom = (event: Event) => {
    event.preventDefault();
  };
  document.addEventListener("gesturestart", blockZoom, {
    passive: false,
  } as AddEventListenerOptions);
  document.addEventListener("gesturechange", blockZoom, {
    passive: false,
  } as AddEventListenerOptions);
  document.addEventListener("gestureend", blockZoom, {
    passive: false,
  } as AddEventListenerOptions);

  return () => {
    vv?.removeEventListener("resize", keepTop);
    vv?.removeEventListener("scroll", keepTop);
    window.removeEventListener("focusin", keepTop);
    document.removeEventListener("gesturestart", blockZoom);
    document.removeEventListener("gesturechange", blockZoom);
    document.removeEventListener("gestureend", blockZoom);
    root.style.removeProperty("--keyboard-inset");
    delete root.dataset.keyboard;
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
