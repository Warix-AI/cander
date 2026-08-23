"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Dropdown({
  trigger,
  children,
  className,
  menuClassName,
  placement = "bottom",
  align = "start",
  matchTrigger = true,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  menuClassName?: string;
  placement?: "bottom" | "top" | "right";
  align?: "start" | "end";
  matchTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width?: number;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const triggerWrap = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const triggerEl = triggerWrap.current;
    const menu = menuRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = matchTrigger
      ? rect.width
      : (menu?.offsetWidth ?? 168);
    const menuHeight = menu?.offsetHeight ?? 120;
    const gap = 6;
    const pad = 8;

    let left =
      placement === "right"
        ? rect.right + gap
        : align === "end"
          ? rect.right - menuWidth
          : rect.left;

    left = Math.min(left, window.innerWidth - menuWidth - pad);
    left = Math.max(pad, left);

    let top =
      placement === "top"
        ? rect.top - menuHeight - gap
        : placement === "right"
          ? rect.bottom - menuHeight
          : rect.bottom + gap;

    if (placement !== "right" && top + menuHeight > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - menuHeight - gap);
    }
    if (placement === "right") {
      top = Math.min(top, window.innerHeight - menuHeight - pad);
      top = Math.max(pad, top);
    }

    setPos({
      top,
      left,
      width: matchTrigger ? rect.width : undefined,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, placement, align, matchTrigger]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReposition = () => place();
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={root} className={cn("relative min-w-0", className)}>
      <div ref={triggerWrap} className="min-w-0">
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </div>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={
                pos
                  ? {
                      top: pos.top,
                      left: pos.left,
                      width: pos.width,
                    }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
              className={cn(
                "fixed z-[200] rounded-[10px] border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_12px_40px_oklch(0_0_0/0.22)]",
                menuClassName,
              )}
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
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
      <span className="text-[13.5px] leading-5 font-medium tracking-[-0.01em]">
        {title}
      </span>
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
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
