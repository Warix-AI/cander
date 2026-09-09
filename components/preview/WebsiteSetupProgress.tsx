"use client";

import { CanderMark } from "@/components/brand/CanderMark";
import { cn } from "@/lib/utils";

const SEGMENTS = 8;
/** Gap between arcs in degrees */
const GAP_DEG = 8;
const SWEEP = (360 - GAP_DEG * SEGMENTS) / SEGMENTS;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  sweep: number,
) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, startDeg + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/**
 * Blank-preview progress for guided website setup.
 * White canvas; color mark stays still; only the ring spins while building
 * (same pattern as ConnectorLoadingState).
 */
export function WebsiteSetupProgress({
  completedSteps = 0,
  mode = "setup",
  className,
  label,
}: {
  /** 0–8 filled segments during setup */
  completedSteps?: number;
  mode?: "setup" | "building" | "failed";
  className?: string;
  label?: string;
}) {
  const filled = Math.max(0, Math.min(SEGMENTS, Math.floor(completedSteps)));
  const spinning = mode === "building";
  const aria =
    label ??
    (spinning
      ? "Building your website"
      : mode === "failed"
        ? "Website build needs fixes"
        : `Website setup ${filled} of ${SEGMENTS}`);

  const size = 44;
  const cx = size / 2;
  const cy = size / 2;
  const r = 18;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={aria}
      className={cn(
        "flex h-full w-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center self-stretch bg-white px-6 py-16 dark:bg-white",
        className,
      )}
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        {spinning || mode === "failed" ? (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full border-[1.5px]",
              mode === "failed"
                ? "border-destructive/20 border-t-destructive/70"
                : "border-foreground/10 border-t-foreground/55",
              spinning && "motion-reduce:animate-none animate-spin",
            )}
            style={spinning ? { animationDuration: "1.1s" } : undefined}
          />
        ) : (
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="absolute inset-0"
            aria-hidden
          >
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const start = i * (SWEEP + GAP_DEG);
              const active = i < filled;
              return (
                <path
                  key={i}
                  d={arcPath(cx, cy, r, start, SWEEP)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className={
                    active ? "text-foreground/55" : "text-foreground/10"
                  }
                />
              );
            })}
          </svg>
        )}
        {/* Mark stays stationary — only the ring animates. */}
        <CanderMark tone="color" className="!h-5 !w-5" />
      </div>
      <p className="mt-4 max-w-[16rem] text-center text-[13px] text-neutral-500">
        {spinning
          ? "Building your draft…"
          : mode === "failed"
            ? "Fix issues in chat, then try again."
            : filled >= SEGMENTS
              ? "Confirm in chat to build."
              : "Answer the setup questions in chat."}
      </p>
      <span className="sr-only">{aria}</span>
    </div>
  );
}
