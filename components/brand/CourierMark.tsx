"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

export function CourierMark({
  className,
}: {
  className?: string;
}) {
  const { theme } = useTheme();
  const src =
    theme === "light"
      ? "/courier-mark-light.png?v=8"
      : "/courier-mark-dark.png?v=8";

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
