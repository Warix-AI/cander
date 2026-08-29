"use client";

import { cn } from "@/lib/utils";

/**
 * Soft left-to-right shimmer on the word “Thinking” — no trailing dots.
 */
export function ThinkingIndicator({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "thinking-shimmer text-[14.5px] leading-relaxed tracking-[-0.01em]",
        className,
      )}
      aria-live="polite"
      aria-label="Thinking"
    >
      Thinking
    </p>
  );
}
