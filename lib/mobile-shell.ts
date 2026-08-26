"use client";

import { useEffect, useState } from "react";

type KeyboardPlugin = {
  setAccessoryBarVisible?: (opts: { isVisible: boolean }) => Promise<void>;
  setScroll?: (opts: { isDisabled: boolean }) => Promise<void>;
  addListener?: (
    event:
      | "keyboardWillShow"
      | "keyboardDidShow"
      | "keyboardWillHide"
      | "keyboardDidHide",
    cb: (info: { keyboardHeight: number }) => void,
  ) => Promise<{ remove: () => void }>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { Keyboard?: KeyboardPlugin };
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

/** Shared across duplicate lock calls so one listener can't zero out another. */
let pluginHeight = 0;
let lockCount = 0;
let sharedCleanups: Array<() => void> = [];

function writeKeyboardInset(px: number) {
  const root = document.documentElement;
  const value = Math.max(0, Math.round(px));
  root.style.setProperty("--keyboard-inset", `${value}px`);
  root.dataset.keyboard = value > 24 ? "1" : "0";
}

function applyKeyboardInset() {
  const vv = window.visualViewport;
  let viewportKb = 0;
  if (vv) {
    viewportKb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  }
  writeKeyboardInset(Math.max(pluginHeight, viewportKb));
  if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
}

function ensureSharedListeners() {
  if (sharedCleanups.length > 0) return;

  const keyboard = getCapacitor()?.Plugins?.Keyboard;
  // Do not call setScroll / setAccessoryBar on boot — they hit a null window
  // on iOS before the scene is ready and spam Keyboard/scene warnings.

  if (keyboard?.addListener) {
    const onShow = (info: { keyboardHeight: number }) => {
      pluginHeight = Math.max(0, info.keyboardHeight || 0);
      applyKeyboardInset();
    };
    const onHide = () => {
      pluginHeight = 0;
      applyKeyboardInset();
    };
    void keyboard.addListener("keyboardWillShow", onShow).then((handle) =>
      sharedCleanups.push(() => handle.remove()),
    );
    void keyboard.addListener("keyboardDidShow", onShow).then((handle) =>
      sharedCleanups.push(() => handle.remove()),
    );
    void keyboard.addListener("keyboardWillHide", onHide).then((handle) =>
      sharedCleanups.push(() => handle.remove()),
    );
    void keyboard.addListener("keyboardDidHide", onHide).then((handle) =>
      sharedCleanups.push(() => handle.remove()),
    );
  }

  const vv = window.visualViewport;
  vv?.addEventListener("resize", applyKeyboardInset);
  vv?.addEventListener("scroll", applyKeyboardInset);
  window.addEventListener("resize", applyKeyboardInset);
  const onFocusIn = () => applyKeyboardInset();
  const onFocusOut = () => {
    window.setTimeout(applyKeyboardInset, 120);
  };
  window.addEventListener("focusin", onFocusIn);
  window.addEventListener("focusout", onFocusOut);
  sharedCleanups.push(() => {
    vv?.removeEventListener("resize", applyKeyboardInset);
    vv?.removeEventListener("scroll", applyKeyboardInset);
    window.removeEventListener("resize", applyKeyboardInset);
    window.removeEventListener("focusin", onFocusIn);
    window.removeEventListener("focusout", onFocusOut);
  });

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
  sharedCleanups.push(() => {
    document.removeEventListener("gesturestart", blockZoom);
    document.removeEventListener("gesturechange", blockZoom);
    document.removeEventListener("gestureend", blockZoom);
  });

  applyKeyboardInset();
}

/**
 * Lift the composer with the keyboard (padding-bottom = keyboard height).
 * Hide iOS form accessory when Capacitor Keyboard is present.
 *
 * With Capacitor `Keyboard.resize: none`, the WebView often does not shrink, so
 * visualViewport alone is unreliable — merge plugin events + viewport. Native
 * iOS/Android bridges may also write `--keyboard-inset` directly.
 */
export function lockMobileViewport() {
  lockCount += 1;
  ensureSharedListeners();

  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0) return;
    sharedCleanups.forEach((fn) => fn());
    sharedCleanups = [];
    pluginHeight = 0;
    writeKeyboardInset(0);
    document.documentElement.style.removeProperty("--keyboard-inset");
    delete document.documentElement.dataset.keyboard;
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
