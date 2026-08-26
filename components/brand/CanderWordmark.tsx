"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

/** Black wordmark for light surfaces; white wordmark for dark surfaces. */
export function CanderWordmark({
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
    ? "/cander-wordmark-dark.png?v=1"
    : "/cander-wordmark-light.png?v=1";

  return (
    <img
      src={src}
      alt="Cander"
      width={856}
      height={151}
      suppressHydrationWarning
      className={cn("h-[22px] w-auto object-contain object-left", className)}
    />
  );
}
