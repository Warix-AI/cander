"use client";

import { CanderMark } from "@/components/brand/CanderMark";
import { cn } from "@/lib/utils";
import { WEBSITE_SETUP_STEP_COUNT } from "@/lib/ai/build/website-setup-brief";

const SEGMENTS = WEBSITE_SETUP_STEP_COUNT;
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
  onRetry,
  detail,
  steps,
}: {
  /** 0–8 filled segments during setup */
  completedSteps?: number;
  mode?: "setup" | "building" | "failed";
  className?: string;
  label?: string;
  /** Failed: re-run /build/ready finalization */
  onRetry?: () => void;
  detail?: string | null;
  /** Building (V2): recent progress lines from the builder job, oldest first. */
  steps?: string[] | null;
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
      <p className="mt-4 max-w-[18rem] text-center text-[13px] text-neutral-500">
        {spinning
          ? steps?.length
            ? "Drafting your website — hang tight."
            : "Building your draft…"
          : mode === "failed"
            ? "Draft preview failed to start."
            : filled >= SEGMENTS
              ? "Confirm in chat to build."
              : "Answer the setup questions in chat."}
      </p>
      {spinning && (detail || steps?.length) ? (
        <div className="mt-3 flex max-w-sm flex-col items-center gap-1 text-center">
          {(steps?.length ? steps.slice(-4, -1) : []).map((line, i) => (
            <p
              key={`${i}-${line}`}
              className="max-w-sm truncate text-[12px] leading-relaxed text-neutral-300"
            >
              {line}
            </p>
          ))}
          <p className="max-w-sm text-[12.5px] leading-relaxed text-neutral-400">
            {steps?.length ? steps[steps.length - 1] : detail}
          </p>
        </div>
      ) : null}
      {mode === "failed" && detail ? (
        <p className="mt-2 max-w-sm text-center text-[12.5px] leading-relaxed text-neutral-400">
          {detail}
        </p>
      ) : null}
      {mode === "failed" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background hover:opacity-90"
        >
          Retry
        </button>
      ) : null}
      <span className="sr-only">{aria}</span>
    </div>
  );
}
