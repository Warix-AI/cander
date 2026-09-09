"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const MARK_VERSION = "13";

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

/** Brand mark — mono for chrome, color for splash / draft loading. */
export function CanderMark({
  className,
  tone = "auto",
}: {
  className?: string;
  /** Force white, black, or brand color; default follows theme / `html.dark`. */
  tone?: "auto" | "white" | "black" | "color";
}) {
  const { theme } = useTheme();
  const htmlDark = useSyncExternalStore(
    subscribeHtmlDark,
    getHtmlDark,
    () => false,
  );
  const src =
    tone === "color"
      ? `/cander-mark-color.png?v=${MARK_VERSION}`
      : tone === "white" ||
          (tone === "auto" && (htmlDark || theme === "dark"))
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
