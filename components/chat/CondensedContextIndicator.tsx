"use client";

/** Subtle system-style marker when condensation actually ran. */
export function CondensedContextIndicator() {
  return (
    <div
      className="flex w-full items-center gap-3 py-1"
      role="status"
      aria-label="Chat condensed"
    >
      <div className="h-px min-w-0 flex-1 bg-border" />
      <span className="shrink-0 text-[11.5px] tracking-[-0.01em] text-muted-foreground/80">
        Chat condensed
      </span>
      <div className="h-px min-w-0 flex-1 bg-border" />
    </div>
  );
}
