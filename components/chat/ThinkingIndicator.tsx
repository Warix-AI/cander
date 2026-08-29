"use client";

import { cn } from "@/lib/utils";

/**
 * Cursor-style thinking: shimmer title on its own line, optional detail below.
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
  const detailText = detail?.trim() || "";

  return (
    <div
      className={cn("flex flex-col items-start gap-1", className)}
      aria-live="polite"
      aria-label={detailText ? `${label}. ${detailText}` : label}
    >
      <p className="m-0 block w-full text-[14.5px] leading-relaxed tracking-[-0.01em]">
        <span className="thinking-shimmer">{label}</span>
      </p>
      {detailText ? (
        <p className="m-0 block w-full text-[13px] leading-snug tracking-[-0.01em] text-muted-foreground">
          <span className="thinking-shimmer opacity-90">{detailText}</span>
        </p>
      ) : null}
    </div>
  );
}
