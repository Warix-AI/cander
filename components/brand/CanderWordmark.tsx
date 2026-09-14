"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const WORDMARK_VERSION = "4";

function subscribeHtmlDark(onStoreChange: () => void) {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  const observer = new MutationObserver(onStoreChange);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getHtmlDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Wordmark that inverts with the surface:
 * black ink on light backgrounds, white ink on dark backgrounds.
 */
export function CanderWordmark({
  className,
  tone = "auto",
}: {
  className?: string;
  /** Force white or black; default follows `html.dark` / theme. */
  tone?: "auto" | "white" | "black";
}) {
  const { theme } = useTheme();
  const htmlDark = useSyncExternalStore(
    subscribeHtmlDark,
    getHtmlDark,
    () => false,
  );
  const useWhite =
    tone === "white" ||
    (tone === "auto" && (htmlDark || theme === "dark"));
  // *-dark = white glyphs for dark UI; *-light = black glyphs for light UI
  const src = useWhite
    ? `/cander-wordmark-dark.png?v=${WORDMARK_VERSION}`
    : `/cander-wordmark-light.png?v=${WORDMARK_VERSION}`;

  return (
    <img
      src={src}
      alt="Cander"
      width={667}
      height={147}
      suppressHydrationWarning
      className={cn(
        "block h-[18px] w-auto max-w-[7.5rem] object-contain object-left",
        className,
      )}
    />
  );
}
