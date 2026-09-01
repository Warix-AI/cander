import {
  bootstrapThemeBackground,
  resolveBootstrapTheme,
  type BootstrapTheme,
} from "@/lib/theme-bootstrap";
import { getCanderDesktopBridge, isDesktopShell } from "@/lib/desktop-shell";

/** Persist appearance theme for native shells (Electron userData, Capacitor chrome). */
export function syncNativeShellTheme(theme?: BootstrapTheme) {
  const resolved = theme ?? resolveBootstrapTheme();
  if (isDesktopShell()) {
    void getCanderDesktopBridge()?.shell?.setTheme?.(resolved);
  }
  void import("@/lib/mobile-shell")
    .then((mod) => {
      mod.syncNativeKeyboardStyle(resolved);
      mod.syncNativeShellChrome(resolved);
    })
    .catch(() => {});
  return resolved;
}

export function nativeShellBackground(theme?: BootstrapTheme) {
  return bootstrapThemeBackground(theme ?? resolveBootstrapTheme());
}
