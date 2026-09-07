"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  getAppearanceSnapshot,
  setAppearance,
} from "@/lib/appearance";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  persistTheme,
  subscribeTheme,
} from "@/lib/session";
import type { Theme } from "@/lib/types";
import { resolveBootstrapTheme } from "@/lib/theme-bootstrap";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

/** Keep marketing toggle and app appearance on the same theme. */
function applyTheme(next: Theme) {
  const appearance = getAppearanceSnapshot();

  if (
    appearance.colorMode === "system" ||
    (next === "light" && appearance.colorMode === "dark") ||
    (next === "dark" && appearance.colorMode === "light")
  ) {
    setAppearance({ colorMode: next });
    return;
  }
  persistTheme(next);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    persistTheme(resolveBootstrapTheme());

    try {
      const ua = navigator.userAgent || "";
      const capacitor = (
        window as Window & {
          Capacitor?: { isNativePlatform?: () => boolean };
        }
      ).Capacitor;
      if (
        /\bCapacitor\b/i.test(ua) ||
        (capacitor &&
          typeof capacitor.isNativePlatform === "function" &&
          capacitor.isNativePlatform())
      ) {
        root.classList.add("cander-mobile");
      }
    } catch {
      // Native shell detection is best effort.
    }
  }, []);

  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
