"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MobileSlideDirection = "forward" | "back";

/** Tracks push/pop direction from stack depth changes. */
export function useMobileStackDirection(depth: number): MobileSlideDirection {
  const prev = useRef(depth);
  const [direction, setDirection] = useState<MobileSlideDirection>("forward");

  useEffect(() => {
    if (depth > prev.current) setDirection("forward");
    else if (depth < prev.current) setDirection("back");
    prev.current = depth;
  }, [depth]);

  return direction;
}

/** iOS-style horizontal push/pop between stacked mobile screens. */
export function MobileSlideStack({
  activeKey,
  direction,
  className,
  frameClassName,
  children,
}: {
  activeKey: string;
  direction: MobileSlideDirection;
  className?: string;
  frameClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative min-h-0 flex-1 overflow-hidden", className)}>
      <div
        key={activeKey}
        className={cn(
          "absolute inset-0 flex min-h-0 flex-col overflow-hidden",
          direction === "forward"
            ? "mobile-slide-forward"
            : "mobile-slide-back",
          frameClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
