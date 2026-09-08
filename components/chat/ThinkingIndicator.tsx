"use client";

import type { TurnActivityPhase } from "@/lib/ai/turn-activity";
import { detailForPhase } from "@/lib/ai/turn-activity";
import { cn } from "@/lib/utils";

function cleanStatusText(value: string): string {
  return value.replace(/\s*[.…]+$/u, "").trim();
}

/** Map jargon / startup copy to the quiet default label. */
function normalizeStatusText(value: string): string {
  const cleaned = cleanStatusText(value);
  if (
    !cleaned ||
    /^(starting agent|understanding your request|gathering what(?:’|')?s needed|preparing a response)$/i.test(
      cleaned,
    )
  ) {
    return "Thinking";
  }
  return cleaned;
}

/**
 * In-flight turn indicator — single status line with a light-wave shimmer.
 * Default: "Thinking". Specific actions (web search, etc.) replace it.
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
  const visibleDetail = normalizeStatusText(
    detail?.trim() ||
      (phase ? detailForPhase(phase) : null) ||
      (label && !/^Thinking\b/i.test(label) ? label : "Thinking") ||
      "Thinking",
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
