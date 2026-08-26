"use client";

import { hourlyUsage } from "@/lib/hourly-usage";
import { cn } from "@/lib/utils";

export function ComposerUsageBar({
  floating = false,
  percent = hourlyUsage().percent,
  className,
}: {
  floating?: boolean;
  percent?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "composer-usage-row mx-auto w-[90%]",
        floating
          ? "pb-3"
          : "pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4",
        className,
      )}
    >
      <div className="group relative">
        <div
          className="h-[5px] overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${percent}% of hourly usage`}
        >
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <UsageTooltip percent={percent} />
      </div>
    </div>
  );
}

function UsageTooltip({ percent }: { percent: number }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 -translate-x-1/2",
        "whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1",
        "text-[11px] tracking-[-0.01em] text-popover-foreground shadow-sm",
        "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
      )}
    >
      {percent}% hourly usage
    </div>
  );
}
