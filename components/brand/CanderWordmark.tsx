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
    ? "/cander-wordmark-dark.png?v=2"
    : "/cander-wordmark-light.png?v=2";

  return (
    <img
      src={src}
      alt="Cander"
      width={713}
      height={151}
      suppressHydrationWarning
      className={cn("h-[17px] w-auto object-contain object-left", className)}
    />
  );
}
