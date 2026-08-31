"use client";

import { useEffect, useRef, useState } from "react";
import { CanderActivityMark } from "@/components/brand/CanderActivityMark";
import type { TurnActivityPhase } from "@/lib/ai/turn-activity";
import { labelForPhase } from "@/lib/ai/turn-activity";
import { cn } from "@/lib/utils";

/**
 * In-flight turn indicator — spinning Cander mark (no elapsed timer text).
 * Fades out smoothly when `active` becomes false.
 */
export function ThinkingIndicator({
  className,
  phase,
  label,
  active = true,
}: {
  className?: string;
  phase?: TurnActivityPhase;
  startedAt?: number;
  /** Legacy fallback when phase is missing. */
  label?: string;
  active?: boolean;
}) {
  const accessible =
    (phase ? labelForPhase(phase) : null) ||
    (label && !/^Thinking\b/i.test(label) ? label : null) ||
    "Generating";

  const [exiting, setExiting] = useState(false);
  const [mounted, setMounted] = useState(active);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (exitTimer.current) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (active) {
      setMounted(true);
      setExiting(false);
      return;
    }
    setExiting(true);
    exitTimer.current = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
      exitTimer.current = null;
    }, 320);
    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    };
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "flex w-full items-center transition-opacity duration-300 ease-out",
        exiting ? "opacity-0" : "opacity-100",
        className,
      )}
    >
      <CanderActivityMark label={accessible} />
    </div>
  );
}
