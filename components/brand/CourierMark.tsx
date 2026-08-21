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
      ? "/courier-mark-light.png?v=2"
      : "/courier-mark-dark.png?v=2";

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={73}
      height={70}
      className={cn("h-[29.7px] w-[31px] object-contain", className)}
    />
  );
}
