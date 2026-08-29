"use client";

import { cn } from "@/lib/utils";

/**
 * Tool/work activity only — never shown for ordinary chat replies.
 * Label and detail are always stacked (detail on the line below).
 */
export function ThinkingIndicator({
  className,
  label = "Working",
  detail,
}: {
  className?: string;
  label?: string;
  detail?: string | null;
}) {
  const detailText = detail?.trim() || "";
  if (!detailText) return null;

  return (
    <div
      className={cn("flex w-full flex-col items-start gap-1", className)}
      aria-live="polite"
      aria-label={`${label}. ${detailText}`}
    >
      <div className="block w-full text-[14.5px] leading-relaxed tracking-[-0.01em]">
        <span className="thinking-shimmer">{label}</span>
      </div>
      <div className="block w-full text-[13px] leading-snug tracking-[-0.01em] text-muted-foreground">
        <span className="thinking-shimmer opacity-90">{detailText}</span>
      </div>
    </div>
  );
}
