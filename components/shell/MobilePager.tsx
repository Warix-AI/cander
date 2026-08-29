"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MobileSurface } from "@/lib/types";
import { consumeSkipMobilePagerTransition } from "@/lib/mobile-nav-transition";
import { cn } from "@/lib/utils";

/**
 * Full-width horizontal pager: each child is one screen.
 * `panes` lists the surface order; `active` selects which is visible.
 */
export function MobilePager({
  panes,
  active,
  children,
  className,
}: {
  panes: MobileSurface[];
  active: MobileSurface;
  children: ReactNode[];
  className?: string;
}) {
  const n = Math.max(panes.length, 1);
  const safeActive = panes.includes(active) ? active : panes[0]!;
  const index = Math.max(0, panes.indexOf(safeActive));
  const [trackedIndex, setTrackedIndex] = useState(index);
  const [animate, setAnimate] = useState(true);

  // Sync during render so a "back to space" skip applies before paint.
  if (index !== trackedIndex) {
    setTrackedIndex(index);
    setAnimate(!consumeSkipMobilePagerTransition());
  }

  useEffect(() => {
    if (animate) return;
    const id = window.requestAnimationFrame(() => setAnimate(true));
    return () => window.cancelAnimationFrame(id);
  }, [animate, trackedIndex]);

  return (
    <div className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", className)}>
      <div
        className={cn(
          "flex h-full will-change-transform",
          animate &&
            "transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
        style={{
          width: `${n * 100}%`,
          transform: `translate3d(-${(index * 100) / n}%, 0, 0)`,
        }}
      >
        {children.map((child, i) => (
          <div
            key={panes[i] ?? i}
            className="flex h-full min-w-0 flex-col overflow-hidden"
            style={{ width: `${100 / n}%` }}
            aria-hidden={panes[i] !== safeActive}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
