"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Always shows the primary “Thinking” line while pending.
 * Optional detail stacks on the next line — only for tools / deep work
 * (never a “Thinking about …” paraphrase of the user message).
 * After ~6s, shows elapsed time beside the label.
 */
export function ThinkingIndicator({
  className,
  label = "Thinking",
  detail,
}: {
  className?: string;
  label?: string;
  detail?: string | null;
}) {
  const raw = detail?.trim() || "";
  // Legacy / unwanted paraphrase of the user turn — never show beside Thinking.
  const detailText =
    raw && !/^Thinking about\b/i.test(raw) ? raw : "";

  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    setElapsedSec(0);
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [label, detailText]);

  const showElapsed = elapsedSec >= 6;
  const elapsedLabel =
    elapsedSec >= 60
      ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
      : `${elapsedSec}s`;

  return (
    <div
      className={cn("flex w-full flex-col items-start gap-1", className)}
      aria-live="polite"
      aria-label={
        detailText
          ? `${label}. ${detailText}${showElapsed ? `. ${elapsedLabel}` : ""}`
          : `${label}${showElapsed ? `. ${elapsedLabel}` : ""}`
      }
    >
      <div className="flex w-full items-baseline gap-2 text-[14.5px] leading-relaxed tracking-[-0.01em]">
        <span className="thinking-shimmer">{label}</span>
        {showElapsed ? (
          <span className="text-[12.5px] text-muted-foreground tabular-nums">
            {elapsedLabel}
          </span>
        ) : null}
      </div>
      {detailText ? (
        <div className="block w-full text-[13px] leading-snug tracking-[-0.01em] text-muted-foreground">
          <span className="thinking-shimmer opacity-90">{detailText}</span>
        </div>
      ) : null}
    </div>
  );
}
