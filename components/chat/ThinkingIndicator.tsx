"use client";

import { useEffect, useRef, useState } from "react";
import { CanderActivityMark } from "@/components/brand/CanderActivityMark";
import type { TurnActivityPhase } from "@/lib/ai/turn-activity";
import { labelForPhase } from "@/lib/ai/turn-activity";
import { cn } from "@/lib/utils";

const STATUS_CYCLE = ["Thinking", "Searching", "Generating"] as const;

function useCyclingStatus(active: boolean, intervalMs = 2200) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((value) => (value + 1) % STATUS_CYCLE.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return STATUS_CYCLE[index]!;
}

/**
 * In-flight turn indicator — spinning Cander mark with cycling status text.
 * Fades out when `active` becomes false.
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
  const cyclingLabel = useCyclingStatus(active);
  const visibleLabel = cyclingLabel;

  const accessible =
    (phase ? labelForPhase(phase) : null) ||
    (label && !/^Thinking\b/i.test(label) ? label : null) ||
    cyclingLabel;

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
    }, 180);
    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    };
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-2.5 transition-opacity duration-200 ease-out",
        exiting ? "opacity-0" : "opacity-100",
        className,
      )}
    >
      <CanderActivityMark label={accessible} />
      <span
        key={visibleLabel}
        className="text-[14px] font-medium tracking-[-0.01em] text-muted-foreground"
        aria-hidden
      >
        {visibleLabel}
      </span>
    </div>
  );
}
