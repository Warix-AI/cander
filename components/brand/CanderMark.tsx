"use client";

import { cn } from "@/lib/utils";

const MARK_SRC = "/cander-mark.png?v=15";

/** Marble orb mark — works on light and dark without invert filters. */
export function CanderMark({
  className,
  tone: _tone = "auto",
}: {
  className?: string;
  /** Kept for call-site compatibility; new orb is theme-neutral. */
  tone?: "auto" | "white" | "black";
}) {
  return (
    <img
      src={MARK_SRC}
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      suppressHydrationWarning
      className={cn("h-[29.7px] w-[29.7px] object-contain", className)}
    />
  );
}
