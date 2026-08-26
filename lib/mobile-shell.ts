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
  // Fallback when bridge is not yet injected
  return /\bCapacitor\b/i.test(navigator.userAgent);
}

export function getMobilePlatform(): "ios" | "android" | "web" {
  const cap = getCapacitor();
  const platform = cap?.getPlatform?.();
  if (platform === "ios" || platform === "android") return platform;
  return "web";
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
    return () => {
      document.documentElement.classList.remove("cander-mobile");
      delete document.documentElement.dataset.canderMobile;
    };
  }, []);
  return mobile;
}
