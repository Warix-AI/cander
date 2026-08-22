"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

/** Courier mark for the Discovery sidebar entry — theme-swapped assets. */
export function DiscoveryMark({ className }: { className?: string }) {
  const { theme } = useTheme();
  // Dark-background mark for light UI; light-background mark for dark UI.
  const src =
    theme === "light"
      ? "/discovery-mark-light.png"
      : "/discovery-mark-dark.png";

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-[10px]",
        className,
      )}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        width={147}
        height={147}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
