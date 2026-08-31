"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const MARK_VERSION = "12";

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

/** White mark for dark surfaces; black mark for light surfaces. */
export function CanderMark({
  className,
  tone = "auto",
}: {
  className?: string;
  /** Force white or black; default follows theme / `html.dark`. */
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
  const src = useWhite
    ? `/cander-mark-dark.png?v=${MARK_VERSION}`
    : `/cander-mark-light.png?v=${MARK_VERSION}`;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={248}
      height={238}
      suppressHydrationWarning
      className={cn("h-[29.7px] w-[31px] object-contain", className)}
    />
  );
}
