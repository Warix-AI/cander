"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dropdown({
  trigger,
  children,
  className,
  menuClassName,
  placement = "bottom",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  menuClassName?: string;
  placement?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative min-w-0", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute left-0 z-50 min-w-full rounded-lg border border-border bg-background p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)]",
            placement === "top"
              ? "bottom-[calc(100%+6px)]"
              : "top-[calc(100%+6px)]",
            menuClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuRow({
  active,
  title,
  body,
  onClick,
}: {
  active?: boolean;
  title: string;
  body?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors duration-200",
        active ? "bg-muted" : "hover:bg-muted",
      )}
    >
      <span className="text-[13.5px] font-medium tracking-[-0.01em]">{title}</span>
      {body ? (
        <span className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {body}
        </span>
      ) : null}
    </button>
  );
}

export function SegTabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "h-8 rounded-lg px-2.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
            value === item.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
