"use client";

import { Briefcase, Image, LayoutTemplate, Search } from "lucide-react";
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
    wash: string;
    Icon: typeof Image;
  }
> = {
  studio: {
    wash: "panel-wash-promo",
    Icon: Image,
  },
  build: {
    wash: "panel-wash-spaces",
    Icon: LayoutTemplate,
  },
  research: {
    wash: "panel-wash-host",
    Icon: Search,
  },
  work: {
    wash: "panel-wash-price",
    Icon: Briefcase,
  },
};

/**
 * Compact right-panel empty state — centered, ~390px, G3 curves.
 * Color + icon shift per space; single primary action (New project).
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
  const Icon = visual.Icon;

  return (
    <div
      className={cn(
        "flex w-full max-w-[390px] flex-col gap-4 border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        SHELL_G3_RADIUS,
        className,
      )}
    >
      <div
        className={cn(
          "relative h-[94px] w-full overflow-hidden",
          SHELL_G3_RADIUS,
          visual.wash,
        )}
        aria-hidden
      >
        {/* Slightly darken washes so white icons stay readable */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="panel-grain opacity-40" />
        <div className="space-empty-shimmer" />
        <div className="absolute inset-0 flex items-end p-3.5">
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center bg-black/25 ring-1 ring-white/25 backdrop-blur-[2px]",
              SHELL_G3_RADIUS,
            )}
          >
            <Icon className="h-5 w-5 text-white" strokeWidth={1.7} />
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[16px] font-semibold tracking-[-0.03em]">{title}</p>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onAction}
        className={cn(
          "inline-flex h-10 w-full items-center justify-center bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground transition-colors duration-200 hover:bg-foreground disabled:opacity-60",
          SHELL_G3_RADIUS,
        )}
      >
        {actionLabel}
      </button>
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
    description: "Pin apps, projects, and connections in one place.",
    actionLabel: "New project",
  },
} as const;
