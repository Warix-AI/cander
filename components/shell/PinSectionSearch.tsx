"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  SIDEBAR_ROW,
  SIDEBAR_ROW_HOVER,
  SIDEBAR_ROW_ICON,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

/**
 * Search control at the top of the active sidebar segment list.
 */
export function PinSectionSearch({
  value,
  onChange,
  placeholder = "Search",
  matchPrimaryCard = false,
  padClassName,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  matchPrimaryCard?: boolean;
  padClassName?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (value && !editing) setEditing(true);
  }, [value, editing]);

  void matchPrimaryCard;
  void padClassName;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          SIDEBAR_ROW,
          SIDEBAR_ROW_HOVER,
          "text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        <Search className={SIDEBAR_ROW_ICON} strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        SIDEBAR_ROW,
        "bg-black/[0.04] dark:bg-white/[0.06]",
        className,
      )}
    >
      <Search className={SIDEBAR_ROW_ICON} strokeWidth={2} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (!value.trim()) setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-[13px] tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
