"use client";

import { cn } from "@/lib/utils";

/**
 * Always shows the primary “Thinking” line while pending.
 * Optional detail stacks on the next line — only for tools / deep work
 * (never a “Thinking about …” paraphrase of the user message).
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

  return (
    <div
      className={cn("flex w-full flex-col items-start gap-1", className)}
      aria-live="polite"
      aria-label={detailText ? `${label}. ${detailText}` : label}
    >
      <div className="block w-full text-[14.5px] leading-relaxed tracking-[-0.01em]">
        <span className="thinking-shimmer">{label}</span>
      </div>
      {detailText ? (
        <div className="block w-full text-[13px] leading-snug tracking-[-0.01em] text-muted-foreground">
          <span className="thinking-shimmer opacity-90">{detailText}</span>
        </div>
      ) : null}
    </div>
  );
}
