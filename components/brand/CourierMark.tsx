"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

/** White mark for dark / on-color surfaces; black mark for light surfaces. */
export function CourierMark({
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
  const preferred = useWhite
    ? "/courier-mark-dark.png?v=9"
    : "/courier-mark-light.png?v=9";
  const [src, setSrc] = useState(preferred);

  useEffect(() => {
    setSrc(preferred);
  }, [preferred]);

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={248}
      height={238}
      suppressHydrationWarning
      onError={() => setSrc("/cander-mark.png?v=9")}
      className={cn("h-[29.7px] w-[31px] object-contain", className)}
    />
  );
}
