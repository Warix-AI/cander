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
    theme === "light" ? "/courier-mark-light.png" : "/courier-mark-dark.png";

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={40}
      height={38}
      className={cn("h-[29.7px] w-[31px] object-contain", className)}
    />
  );
}
