"use client";

import { useEffect, useSyncExternalStore } from "react";

type ListenerHandle = { remove: () => void };

type KeyboardPlugin = {
  setAccessoryBarVisible?: (opts: { isVisible: boolean }) => Promise<void>;
  setScroll?: (opts: { isDisabled: boolean }) => Promise<void>;
  setStyle?: (opts: { style: "LIGHT" | "DARK" | "DEFAULT" }) => Promise<void>;
  show?: () => Promise<void>;
  hide?: () => Promise<void>;
  addListener?: (
    event:
      | "keyboardWillShow"
      | "keyboardDidShow"
      | "keyboardWillHide"
      | "keyboardDidHide",
    cb: (info: { keyboardHeight: number }) => void,
  ) => ListenerHandle | Promise<ListenerHandle> | void;
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

/** Open a billing or marketing URL outside the in-app WebView (Safari / Chrome). */
export function openExternalUrl(url: string) {
  if (typeof window === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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

function viewportKeyboardHeight() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

function applyKeyboardInset() {
  const viewportKb = viewportKeyboardHeight();
  writeKeyboardInset(Math.max(pluginHeight, viewportKb));
  if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
}

function isEditableField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  );
}

function heightFromEvent(event: Event): number {
  const anyEvent = event as Event & {
    keyboardHeight?: number;
    detail?: { keyboardHeight?: number } | string;
  };
  if (typeof anyEvent.keyboardHeight === "number") return anyEvent.keyboardHeight;
  const detail = anyEvent.detail;
  if (detail && typeof detail === "object" && typeof detail.keyboardHeight === "number") {
    return detail.keyboardHeight;
  }
  if (typeof detail === "string") {
    try {
      const parsed = JSON.parse(detail.replace(/'/g, '"')) as {
        keyboardHeight?: number;
      };
      if (typeof parsed.keyboardHeight === "number") return parsed.keyboardHeight;
    } catch {
      // ignore
    }
  }
  return 0;
}

/** Capacitor Plugins.Keyboard.addListener may return a handle OR a Promise — never assume .then. */
function bindPluginListener(
  keyboard: KeyboardPlugin,
  event:
    | "keyboardWillShow"
    | "keyboardDidShow"
    | "keyboardWillHide"
    | "keyboardDidHide",
  cb: (info: { keyboardHeight: number }) => void,
) {
  if (!keyboard.addListener) return;
  try {
    const result = keyboard.addListener(event, cb) as unknown;
    if (!result) return;
    if (typeof (result as Promise<ListenerHandle>).then === "function") {
      void (result as Promise<ListenerHandle>)
        .then((handle) => {
          if (handle?.remove) sharedCleanups.push(() => handle.remove());
        })
        .catch(() => {
          // never blank the app over keyboard wiring
        });
      return;
    }
    if (typeof (result as ListenerHandle).remove === "function") {
      sharedCleanups.push(() => (result as ListenerHandle).remove());
    }
  } catch {
    // ignore plugin wiring failures
  }
}

function ensureSharedListeners() {
  if (sharedCleanups.length > 0) return;

  const onShow = (info: { keyboardHeight: number }) => {
    pluginHeight = Math.max(0, info.keyboardHeight || 0);
    applyKeyboardInset();
    syncNativeKeyboardStyle();
  };
  const onHide = () => {
    pluginHeight = 0;
    applyKeyboardInset();
  };

  // Window events fired by @capacitor/keyboard (safe; no Promise assumptions).
  const onWinShow = (event: Event) => {
    onShow({ keyboardHeight: heightFromEvent(event) });
  };
  const onWinHide = () => onHide();
  window.addEventListener("keyboardWillShow", onWinShow);
  window.addEventListener("keyboardDidShow", onWinShow);
  window.addEventListener("keyboardWillHide", onWinHide);
  window.addEventListener("keyboardDidHide", onWinHide);
  sharedCleanups.push(() => {
    window.removeEventListener("keyboardWillShow", onWinShow);
    window.removeEventListener("keyboardDidShow", onWinShow);
    window.removeEventListener("keyboardWillHide", onWinHide);
    window.removeEventListener("keyboardDidHide", onWinHide);
  });

  const keyboard = getCapacitor()?.Plugins?.Keyboard;
  if (keyboard) {
    bindPluginListener(keyboard, "keyboardWillShow", onShow);
    bindPluginListener(keyboard, "keyboardDidShow", onShow);
    bindPluginListener(keyboard, "keyboardWillHide", onHide);
    bindPluginListener(keyboard, "keyboardDidHide", onHide);
  }

  const vv = window.visualViewport;
  vv?.addEventListener("resize", applyKeyboardInset);
  vv?.addEventListener("scroll", applyKeyboardInset);
  window.addEventListener("resize", applyKeyboardInset);
  const onFocusIn = (event: FocusEvent) => {
    applyKeyboardInset();
    if (isEditableField(event.target) && event.target instanceof HTMLElement) {
      event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    // Only drop inset when focus leaves editable fields and the keyboard actually closed.
    if (isEditableField(event.relatedTarget)) return;
    applyKeyboardInset();
    if (viewportKeyboardHeight() <= 24 && pluginHeight <= 24) {
      writeKeyboardInset(0);
    }
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

  const onTheme = () => syncNativeKeyboardStyle();
  window.addEventListener("cander-theme", onTheme);
  sharedCleanups.push(() => {
    window.removeEventListener("cander-theme", onTheme);
  });
}

/** Match native keyboard chrome to the app theme (not OS appearance). */
export function syncNativeKeyboardStyle(theme?: "light" | "dark") {
  const keyboard = getCapacitor()?.Plugins?.Keyboard;
  if (!keyboard?.setStyle) return;
  const resolved =
    theme ??
    (document.documentElement.classList.contains("dark") ? "dark" : "light");
  void keyboard.setStyle({
    style: resolved === "dark" ? "DARK" : "LIGHT",
  }).catch(() => {
    // Older Capacitor builds may not support setStyle.
  });
}

/** Dismiss the native keyboard (Capacitor). Safe no-op on web. */
export function dismissNativeKeyboard() {
  if (typeof document !== "undefined") {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.tagName === "TEXTAREA" ||
        active.tagName === "INPUT" ||
        active.isContentEditable)
    ) {
      active.blur();
    }
  }
  const keyboard = getCapacitor()?.Plugins?.Keyboard;
  if (!keyboard?.hide) return;
  void keyboard.hide().catch(() => {
    // ignore
  });
}

/**
 * Lift the composer with the keyboard (padding-bottom = keyboard height).
 *
 * With Capacitor `Keyboard.resize: none`, the WebView often does not shrink, so
 * visualViewport alone is unreliable — merge plugin/window events + viewport.
 * Native iOS/Android bridges may also write `--keyboard-inset` directly.
 */
export function lockMobileViewport() {
  lockCount += 1;
  try {
    ensureSharedListeners();
    syncNativeKeyboardStyle();
  } catch {
    // Keyboard wiring must never blank the app.
  }

  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0) return;
    sharedCleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
    sharedCleanups = [];
    pluginHeight = 0;
    writeKeyboardInset(0);
    document.documentElement.style.removeProperty("--keyboard-inset");
    delete document.documentElement.dataset.keyboard;
  };
}

/** Client hook — false on the server / in a normal browser. */
export function useMobileShell() {
  const mobile = useSyncExternalStore(
    (callback) => {
      callback();
      return () => {};
    },
    () => isMobileShell(),
    () => false,
  );

  useEffect(() => {
    if (!mobile) return;
    document.documentElement.classList.add("cander-mobile");
    document.documentElement.dataset.canderMobile = getMobilePlatform();
    const unlock = lockMobileViewport();
    return () => {
      unlock();
      document.documentElement.classList.remove("cander-mobile");
      delete document.documentElement.dataset.canderMobile;
    };
  }, [mobile]);

  return mobile;
}
