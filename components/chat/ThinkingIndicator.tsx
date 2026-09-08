"use client";

import { useEffect, useState } from "react";
import type { TurnActivityPhase } from "@/lib/ai/turn-activity";
import { detailForPhase } from "@/lib/ai/turn-activity";
import { cn } from "@/lib/utils";

const STATUS_CYCLE = [
  "Understanding your request",
  "Gathering what’s needed",
  "Preparing a response",
] as const;
/** Time each status label stays visible before cycling to the next. */
const STATUS_CYCLE_MS = 5000;

function useCyclingStatus(active: boolean, intervalMs = STATUS_CYCLE_MS) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setIndex((value) => (value + 1) % STATUS_CYCLE.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return STATUS_CYCLE[index]!;
}

function cleanStatusText(value: string): string {
  return value.replace(/\s*[.…]+$/u, "").trim();
}

/**
 * In-flight turn indicator — single status line with a light-wave shimmer.
 */
export function ThinkingIndicator({
  className,
  phase,
  detail,
  label,
  active = true,
}: {
  className?: string;
  phase?: TurnActivityPhase;
  detail?: string;
  /** Legacy fallback when phase is missing. */
  label?: string;
  active?: boolean;
}) {
  const cyclingLabel = useCyclingStatus(active && !phase && !detail);
  const visibleDetail = cleanStatusText(
    detail?.trim() ||
      (phase ? detailForPhase(phase) : null) ||
      (label && !/^Thinking\b/i.test(label) ? label : cyclingLabel) ||
      "",
  );

  return (
    <div
      className={cn(
        "flex w-full items-center transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={visibleDetail}
    >
      <p
        key={visibleDetail}
        className="thinking-shimmer animate-in fade-in text-[16px] font-medium leading-6 tracking-[-0.015em] duration-300 sm:text-[17px]"
      >
        {visibleDetail}
      </p>
    </div>
  );
}
