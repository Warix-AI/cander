"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { getAppearanceSnapshot, setAppearance } from "@/lib/appearance";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  persistTheme,
  subscribeTheme,
} from "@/lib/session";
import type { Theme } from "@/lib/types";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

/** Keep marketing toggle and app appearance sliders on the same theme. */
function applyTheme(next: Theme) {
  const appearance = getAppearanceSnapshot();
  if (next === "light" && appearance.color >= 45) {
    setAppearance({ color: 8 });
    return;
  }
  if (next === "dark" && appearance.color < 45) {
    setAppearance({ color: 50 });
    return;
  }
  persistTheme(next);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
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
