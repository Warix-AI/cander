"use client";

import { CanderMark } from "@/components/brand/CanderMark";
import { cn } from "@/lib/utils";

/**
 * Spinning Cander mark used while a turn is in flight
 * (replaces “Generating · Ns” text).
 */
export function CanderActivityMark({
  className,
  label = "Working",
}: {
  className?: string;
  /** Accessible status for screen readers. */
  label?: string;
}) {
  return (
    <div
      className={cn("flex items-center", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <CanderMark className="cander-pinwheel !h-5 !w-5" />
    </div>
  );
}
