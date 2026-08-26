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
 * Keep the app canvas full-height. Track keyboard inset so the composer
 * can sit just above the keyboard — no shrinking the whole screen.
 */
export function lockMobileViewport() {
  const root = document.documentElement;

  const sync = () => {
    const vv = window.visualViewport;
    if (!vv) {
      root.style.setProperty("--keyboard-inset", "0px");
      root.dataset.keyboard = "0";
      return;
    }
    // Visible gap between layout bottom and the visual viewport bottom.
    const keyboard = Math.max(
      0,
      window.innerHeight - vv.height - vv.offsetTop,
    );
    root.style.setProperty("--keyboard-inset", `${Math.round(keyboard)}px`);
    root.dataset.keyboard = keyboard > 40 ? "1" : "0";
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };

  sync();
  const vv = window.visualViewport;
  vv?.addEventListener("resize", sync);
  vv?.addEventListener("scroll", sync);
  window.addEventListener("focusin", sync);
  window.addEventListener("focusout", sync);

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
    vv?.removeEventListener("resize", sync);
    vv?.removeEventListener("scroll", sync);
    window.removeEventListener("focusin", sync);
    window.removeEventListener("focusout", sync);
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
