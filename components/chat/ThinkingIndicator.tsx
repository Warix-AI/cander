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

/**
 * In-flight turn indicator — quiet heading with a truthful live activity line.
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
  const visibleDetail =
    detail?.trim() ||
    (phase ? detailForPhase(phase) : null) ||
    (label && !/^Thinking\b/i.test(label) ? label : cyclingLabel);

  return (
    <div
      className={cn(
        "flex w-full items-start gap-3 transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Working. ${visibleDetail}`}
    >
      <span className="thinking-dot mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500 dark:bg-sky-400" aria-hidden />
      <div className="min-w-0" aria-hidden>
        <div className="text-[14px] font-medium tracking-[-0.01em] text-foreground/80">
          Working
        </div>
        <div
          key={visibleDetail}
          className="mt-0.5 animate-in fade-in slide-in-from-bottom-1 text-[13px] leading-5 text-muted-foreground duration-300"
        >
          {visibleDetail}
        </div>
      </div>
    </div>
  );
}
