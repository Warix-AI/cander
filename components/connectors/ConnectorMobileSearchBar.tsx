"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** In-page mobile search — opened from the connector ⋯ sheet Search action. */
export function ConnectorMobileSearchBar({
  open,
  placeholder,
  value,
  onChange,
  onSubmit,
  onDismiss,
  className,
}: {
  open: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Live search while typing (debounced) so results update without Enter.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      onSubmitRef.current();
    }, 280);
    return () => window.clearTimeout(id);
  }, [open, value]);

  if (!open) return null;

  return (
    <div className={cn("shrink-0 px-4 pb-2 pt-1", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex items-center gap-2 rounded-[12px] border border-border/70 bg-black/[0.04] px-3 dark:bg-white/[0.06]"
      >
        <Search
          className="h-4 w-4 shrink-0 text-muted-foreground"
          strokeWidth={1.8}
        />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.01em] outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="Close search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </form>
    </div>
  );
}
