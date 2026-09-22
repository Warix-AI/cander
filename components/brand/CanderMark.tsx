"use client";

import { cn } from "@/lib/utils";

const MARK_VERSION = "15";

/** Brand mark — circular Cander orb (all tones share the color mark). */
export function CanderMark({
  className,
  tone: _tone = "auto",
}: {
  className?: string;
  /** Kept for call-site compatibility; mark is always the color orb. */
  tone?: "auto" | "white" | "black" | "color";
}) {
  return (
    <img
      src={`/cander-mark-color.png?v=${MARK_VERSION}`}
      alt=""
      aria-hidden="true"
      width={732}
      height={732}
      suppressHydrationWarning
      className={cn("h-[29.7px] w-[29.7px] object-contain", className)}
    />
  );
}
