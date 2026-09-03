"use client";

import { useEffect, type ReactNode } from "react";
import { SHELL_G3_RADIUS, useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
  lockScroll = true,
  edgeToEdge = false,
  backdropClassName = "bg-black/72",
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
  lockScroll?: boolean;
  edgeToEdge?: boolean;
  backdropClassName?: string;
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
        "fixed inset-0 z-[60] flex",
        edgeToEdge
          ? "items-stretch justify-stretch p-0"
          : cn(
              "items-center justify-center",
              floating ? "p-5 sm:p-8" : "p-4 sm:p-6",
            ),
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className={cn("absolute inset-0", backdropClassName)}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 overflow-hidden light-surface bg-popover text-popover-foreground shadow-[0_16px_48px_rgba(0,0,0,0.12)] dark:border dark:border-border dark:bg-zinc-900 dark:shadow-[0_20px_56px_rgba(0,0,0,0.45)]",
          edgeToEdge
            ? "h-full max-h-none w-full rounded-none"
            : cn(
                "max-h-[calc(100vh-2rem)]",
                floating ? SHELL_G3_RADIUS : "rounded-[10px]",
              ),
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
