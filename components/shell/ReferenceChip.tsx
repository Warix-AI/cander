"use client";

import { Link2, X } from "lucide-react";
import type { EntityRef } from "@/lib/space-entities";
import { cn } from "@/lib/utils";

type ReferenceChipProps = {
  ref: EntityRef;
  onRemove?: () => void;
  compact?: boolean;
  className?: string;
};

export function ReferenceChip({
  ref: entityRef,
  onRemove,
  compact = false,
  className,
}: ReferenceChipProps) {
  const label = entityRef.label ?? entityRef.type;
  const detail = entityRef.snapshot ?? entityRef.id;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-background text-[11.5px]",
        compact ? "px-2 py-1" : "px-2.5 py-1.5",
        className,
      )}
    >
      <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.6} />
      <span className="truncate font-medium">{label}</span>
      {!compact ? (
        <span className="truncate font-mono text-muted-foreground">{detail}</span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          aria-label="Remove reference"
          onClick={onRemove}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" strokeWidth={1.8} />
        </button>
      ) : null}
    </span>
  );
}
