"use client";

import { Pin } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import type { PinKind } from "@/lib/types";
import { cn } from "@/lib/utils";

type PinControlProps = {
  kind: PinKind;
  id: string;
  className?: string;
  iconClassName?: string;
  /** Show the control even when the parent is not hovered (e.g. top rail). */
  alwaysVisible?: boolean;
};

export function PinControl({
  kind,
  id,
  className,
  iconClassName,
  alwaysVisible = false,
}: PinControlProps) {
  const { pinTier, setPin, clearPin } = useApp();
  const pinned = Boolean(pinTier(kind, id));

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label={pinned ? "Unpin" : "Pin"}
        aria-pressed={pinned}
        onClick={(event) => {
          event.stopPropagation();
          if (pinned) clearPin(kind, id);
          else setPin(kind, id, "primary");
        }}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-200 hover:text-foreground",
          alwaysVisible
            ? "h-8 w-8 rounded-lg opacity-100 hover:bg-muted"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          !alwaysVisible && pinned && "group-hover:text-foreground",
        )}
      >
        <Pin
          className={cn(
            alwaysVisible ? "h-4 w-4" : "h-3 w-3",
            !alwaysVisible && pinned && "group-hover:fill-current",
            alwaysVisible && pinned && "fill-current",
            iconClassName,
          )}
          strokeWidth={alwaysVisible ? 1.6 : 2}
        />
      </button>
    </div>
  );
}
