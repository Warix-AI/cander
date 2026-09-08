"use client";

import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { cn } from "@/lib/utils";

/**
 * Minimal connector loading: centered mark with a spinner ring around it.
 * Used on desktop + mobile for all pinned connectors.
 */
export function ConnectorLoadingState({
  connectorId,
  className,
  label = "Loading",
}: {
  connectorId: string;
  className?: string;
  /** Screen-reader only. */
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "flex h-full w-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center self-stretch px-6 py-16",
        className,
      )}
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-[1.5px] border-foreground/10 border-t-foreground/55 motion-reduce:animate-none animate-spin"
        />
        <ConnectorMark
          id={connectorId}
          size="nav"
          className="!h-5 !w-5 !bg-transparent"
        />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
