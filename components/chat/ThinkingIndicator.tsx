"use client";

import { cn } from "@/lib/utils";

/**
 * Cursor-style thinking line: shimmer title + optional activity subtitle.
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
  return (
    <div className={cn("space-y-1", className)} aria-live="polite">
      <p
        className="thinking-shimmer text-[14.5px] leading-relaxed tracking-[-0.01em]"
        aria-label={label}
      >
        {label}
      </p>
      {detail?.trim() ? (
        <p className="thinking-shimmer text-[13px] leading-snug tracking-[-0.01em] text-muted-foreground opacity-90">
          {detail.trim()}
        </p>
      ) : null}
    </div>
  );
}
