"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Tooltip for browser chrome controls — header sits above the native surface. */
export function BrowserChromeTooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "bottom" | "top";
}) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: rect.left + rect.width / 2,
      top: side === "top" ? rect.top - 8 : rect.bottom + 8,
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, side]);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), 350);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  };

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {open && pos
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              style={{
                top: pos.top,
                left: pos.left,
                transform:
                  side === "top"
                    ? "translate(-50%, -100%)"
                    : "translate(-50%, 0)",
              }}
              className={cn(
                "pointer-events-none fixed z-[320] whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-medium tracking-[0.01em] shadow-[0_4px_16px_oklch(0_0_0/0.18)]",
                "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900",
              )}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
