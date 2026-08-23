"use client";

import { useEffect, type ReactNode } from "react";
import { SHELL_FLOAT_RADIUS, useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
  lockScroll = true,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
  lockScroll?: boolean;
}) {
  const shell = useShellStyle();
  const floating = shell === "floating";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    if (lockScroll) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      if (lockScroll) {
        document.body.style.overflow = previous;
      }
    };
  }, [open, onClose, lockScroll]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center",
        floating ? "p-5 sm:p-8" : "p-4 sm:p-6",
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/72"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 max-h-[calc(100vh-2rem)] overflow-hidden border border-border bg-background shadow-[0_16px_48px_rgba(0,0,0,0.18)]",
          floating ? SHELL_FLOAT_RADIUS : "rounded-[10px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
