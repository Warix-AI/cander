"use client";

import { useEffect, useState } from "react";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export type SpaceEmptyKey = "studio" | "build" | "research" | "work";

export type SpaceEmptyCardProps = {
  space: SpaceEmptyKey;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  className?: string;
};

const SPACE_VISUAL: Record<
  SpaceEmptyKey,
  {
    gradient: string;
    words: string[];
    /** Centered reel words that show a tiny “Coming soon” chip (Studio). */
    comingSoonWords?: string[];
  }
> = {
  research: {
    gradient:
      "linear-gradient(270deg, oklch(0.7 0.13 232) 0%, oklch(0.76 0.11 245) 18%, oklch(0.84 0.07 250 / 0.72) 38%, oklch(0.9 0.04 250 / 0.35) 58%, oklch(0.95 0.02 250 / 0.12) 74%, transparent 92%)",
    words: ["Search", "Browse", "Collect", "Analyze"],
  },
  build: {
    gradient:
      "linear-gradient(270deg, oklch(0.55 0.19 262) 0%, oklch(0.64 0.16 256) 18%, oklch(0.74 0.1 255 / 0.7) 38%, oklch(0.86 0.05 255 / 0.32) 58%, oklch(0.94 0.02 255 / 0.1) 74%, transparent 92%)",
    words: ["App", "Site", "Automation", "Preview"],
  },
  studio: {
    gradient:
      "linear-gradient(270deg, oklch(0.68 0.15 318) 0%, oklch(0.75 0.12 295) 18%, oklch(0.84 0.07 285 / 0.68) 38%, oklch(0.92 0.04 280 / 0.3) 58%, oklch(0.96 0.02 280 / 0.1) 74%, transparent 92%)",
    words: ["Image", "Video", "Audio", "Present"],
    comingSoonWords: ["Video", "Audio", "Present"],
  },
  work: {
    gradient:
      "linear-gradient(270deg, oklch(0.6 0.13 248) 0%, oklch(0.7 0.1 245) 18%, oklch(0.82 0.06 245 / 0.65) 38%, oklch(0.9 0.03 245 / 0.28) 58%, oklch(0.95 0.015 245 / 0.1) 74%, transparent 92%)",
    words: ["Home", "Build", "Studio", "Pins"],
  },
};

const REEL_INTERVAL_MS = 2000;
const REEL_MOVE_MS = 780;
const REEL_BASE_PX = 17;
const REEL_CENTER_PX = Math.round(REEL_BASE_PX * 1.4);
const REEL_ROW_PX = 40;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/**
 * Seamless infinite reel: three copies of the word list; offset stays in the
 * middle band and wraps by −n so neighbors (prev/next) always exist.
 */
function WordReel({
  words,
  comingSoonWords = [],
}: {
  words: string[];
  comingSoonWords?: string[];
}) {
  const n = words.length;
  const strip = [...words, ...words, ...words];
  const soon = new Set(comingSoonWords);
  const [offset, setOffset] = useState(n);

  useEffect(() => {
    if (n < 2) return;

    let raf = 0;
    let cancelled = false;
    let holdFrom = performance.now();
    let moveFrom = 0;
    let base = n;
    let moving = false;

    const frame = (now: number) => {
      if (cancelled) return;

      if (!moving) {
        if (now - holdFrom >= REEL_INTERVAL_MS) {
          moving = true;
          moveFrom = now;
        }
        setOffset(base);
      } else {
        const t = Math.min(1, (now - moveFrom) / REEL_MOVE_MS);
        setOffset(base + easeOutCubic(t));
        if (t >= 1) {
          base += 1;
          // Finished a full cycle into the third band — snap back one band.
          if (base >= n * 2) {
            base -= n;
          }
          setOffset(base);
          moving = false;
          holdFrom = now;
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [n]);

  const viewport = REEL_ROW_PX * 3;
  const translateY = viewport / 2 - (offset + 0.5) * REEL_ROW_PX;

  return (
    <div
      className="relative ml-auto w-full max-w-[16rem] overflow-hidden"
      style={{ height: viewport }}
      aria-hidden
    >
      <div
        className="flex flex-col items-end will-change-transform"
        style={{ transform: `translateY(${translateY}px)` }}
      >
        {strip.map((word, i) => {
          const distance = Math.abs(i - offset);
          const focus = Math.max(0, 1 - Math.min(distance, 1));
          const isCenter = focus > 0.72;
          const fontSize =
            REEL_BASE_PX + (REEL_CENTER_PX - REEL_BASE_PX) * focus;
          const opacity = 0.28 + 0.72 * focus;
          const showSoon = isCenter && soon.has(word);
          return (
            <span
              key={`${word}-${i}`}
              className="flex w-full items-center justify-end gap-2 text-right font-semibold tracking-[-0.04em] text-white"
              style={{
                height: REEL_ROW_PX,
                fontSize: `${fontSize}px`,
                lineHeight: 1,
                opacity,
                textShadow:
                  focus > 0.6 ? "0 1px 10px rgba(0,0,0,0.22)" : "none",
              }}
            >
              {showSoon ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-[6px] border border-white/35 bg-white/18 px-1.5 py-0.5 text-[9px] font-medium tracking-[0.02em] text-white/95 backdrop-blur-[2px]"
                  style={{
                    opacity: Math.max(0, (focus - 0.72) / 0.28),
                  }}
                >
                  Coming soon
                </span>
              ) : null}
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Full-width empty-state banner under the space toolbar.
 * Perimeter stroke only; soft gradient fades from the right; word reel on the right.
 */
export function SpaceEmptyCard({
  space,
  title,
  description,
  actionLabel,
  onAction,
  busy = false,
  className,
}: SpaceEmptyCardProps) {
  const visual = SPACE_VISUAL[space];

  return (
    <div
      className={cn(
        "relative flex w-full min-h-[9.75rem] overflow-hidden border border-foreground/[0.08] bg-transparent sm:min-h-[11.25rem] dark:border-white/10",
        SHELL_G3_RADIUS,
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 hidden sm:block"
        style={{ background: visual.gradient }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 hidden opacity-[0.16] mix-blend-overlay sm:block panel-grain"
        aria-hidden
      />

      <div className="relative z-10 flex min-w-0 flex-[1.05] flex-col justify-between px-5 py-5 text-left sm:max-w-[52%] sm:px-6 sm:py-6">
        <div className="space-y-1.5">
          <p className="text-[16px] font-semibold tracking-[-0.03em] text-foreground sm:text-[17px]">
            {title}
          </p>
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onAction}
          className="mt-4 inline-flex h-8 w-fit items-center justify-center rounded-[8px] bg-foreground px-3.5 text-[13px] font-medium tracking-[-0.01em] text-background transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
        >
          {actionLabel}
        </button>
      </div>

      <div className="relative z-10 hidden min-w-0 flex-1 items-center justify-end px-5 py-5 sm:flex sm:px-6 sm:py-6">
        <WordReel
          key={space}
          words={visual.words}
          comingSoonWords={visual.comingSoonWords}
        />
      </div>
    </div>
  );
}

/** Copy keyed by product space (right-panel empty cards). */
export const SPACE_EMPTY_COPY = {
  studio: {
    title: "Start creating",
    description: "Generate or edit an image in seconds.",
    actionLabel: "New project",
  },
  build: {
    title: "Start building",
    description: "Ship an app, site, or automation in minutes.",
    actionLabel: "New project",
  },
  research: {
    title: "Start exploring",
    description: "Open a search and collect what you find.",
    actionLabel: "New project",
  },
  work: {
    title: "Start organizing",
    description: "Bring Home, Build, and Studio projects together.",
    actionLabel: "New project",
  },
} as const;
