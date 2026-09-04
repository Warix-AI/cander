"use client";

import { Box, Briefcase, Image, LayoutTemplate, Search } from "lucide-react";
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

const CODE_SAMPLE = `const project = await cander.create({
  name: "untitled",
  space: "ready",
});

await project.open();`;

/**
 * Full-width empty-state banner under the space toolbar.
 * Horizontal layout: copy + CTA on the left, color wash + mark on the right.
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
        "relative flex w-full overflow-hidden border border-border bg-zinc-950 text-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-zinc-950",
        SHELL_G3_RADIUS,
        className,
      )}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-3 px-5 py-5 sm:px-6 sm:py-6">
        <div className="space-y-1.5">
          <p className="text-[17px] font-semibold tracking-[-0.03em] text-white sm:text-[18px]">
            {title}
          </p>
          <p className="max-w-xl text-[13.5px] leading-relaxed text-white/65">
            {description}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onAction}
          className="inline-flex h-8 w-fit items-center justify-center rounded-[8px] bg-white px-3.5 text-[13px] font-medium tracking-[-0.01em] text-zinc-950 transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
        >
          {actionLabel}
        </button>
      </div>

      <div
        className={cn(
          "relative hidden w-[min(42%,22rem)] shrink-0 overflow-hidden sm:block",
          visual.wash,
        )}
        aria-hidden
      >
        <div className="absolute inset-0 bg-black/35" />
        <div className="panel-grain opacity-35" />
        <pre className="pointer-events-none absolute inset-0 overflow-hidden p-4 font-mono text-[9px] leading-relaxed text-white/25 select-none">
          {CODE_SAMPLE}
        </pre>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-zinc-950 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
            <Icon className="h-6 w-6" strokeWidth={1.7} />
          </span>
        </div>
        <span className="absolute bottom-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/25 text-white/80 ring-1 ring-white/20 backdrop-blur-[2px]">
          <Box className="h-3.5 w-3.5" strokeWidth={1.7} />
        </span>
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
