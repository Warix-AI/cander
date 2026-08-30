"use client";

import { useEffect, useState } from "react";
import {
  formatTurnActivityLine,
  labelForPhase,
  type TurnActivityPhase,
} from "@/lib/ai/turn-activity";
import { cn } from "@/lib/utils";

/**
 * Single activity row for an in-flight turn.
 * Example: "Generating · 2s" — never stacks Thinking + Generating.
 */
export function ThinkingIndicator({
  className,
  phase,
  startedAt,
  label,
}: {
  className?: string;
  phase?: TurnActivityPhase;
  /** Turn start — timer continues across phase label changes. */
  startedAt?: number;
  /** Legacy fallback when phase is missing. */
  label?: string;
}) {
  const resolvedPhase: TurnActivityPhase = phase ?? "generating";
  const displayLabel = phase
    ? labelForPhase(phase)
    : label && !/^Thinking\b/i.test(label)
      ? label
      : "Generating";

  const [elapsedSec, setElapsedSec] = useState(() =>
    startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : 0,
  );

  useEffect(() => {
    const anchor = startedAt ?? Date.now();
    setElapsedSec(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
    // Only re-anchor when the turn starts — not when phase changes.
  }, [startedAt]);

  const line = formatTurnActivityLine({
    phase: resolvedPhase,
    elapsedSeconds: elapsedSec,
  });
  // Prefer phase-driven line; if legacy label differs from Generating, still show elapsed.
  const visible =
    phase || !label || /^Thinking\b/i.test(label)
      ? line
      : `${displayLabel} · ${elapsedSec}s`;

  return (
    <div
      className={cn("flex w-full items-start", className)}
      aria-live="polite"
      aria-label={visible}
    >
      <div className="text-[14.5px] leading-relaxed tracking-[-0.01em]">
        <span className="thinking-shimmer tabular-nums">{visible}</span>
      </div>
    </div>
  );
}
