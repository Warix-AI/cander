"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const MARK_VERSION = "11";

/** White mark for dark surfaces; black mark for light surfaces. */
export function CanderMark({
  className,
  tone = "auto",
}: {
  className?: string;
  /** Force white or black; default follows theme. */
  tone?: "auto" | "white" | "black";
}) {
  const { theme } = useTheme();
  const useWhite =
    tone === "white" || (tone === "auto" && theme !== "light");
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
