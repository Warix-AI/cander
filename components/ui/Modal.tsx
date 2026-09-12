"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import { SHELL_G3_RADIUS, useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
  lockScroll = true,
  embedded = false,
  edgeToEdge = false,
  sheetOnMobile = false,
  /** Taller mobile sheet — use for forms that need the keyboard. */
  sheetSize = "default",
  backdropClassName = "bg-black/72",
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
  lockScroll?: boolean;
  /** Render as part of the current workspace surface instead of an overlay. */
  embedded?: boolean;
  edgeToEdge?: boolean;
  /** On mobile, anchor as a bottom sheet instead of a centered dialog. */
  sheetOnMobile?: boolean;
  sheetSize?: "default" | "tall";
  backdropClassName?: string;
}) {
  const shell = useShellStyle();
  const floating = shell === "floating";
  const mobile = useMobileShell();
  const asSheet = sheetOnMobile && mobile && !edgeToEdge && !embedded;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (embedded) {
    return (
      <div
        role="region"
        aria-labelledby={labelledBy}
        className={cn(
          "@container relative flex min-h-0 flex-1 flex-col overflow-hidden text-foreground",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  const overlay = (
    <>
      <NativeOverlayGate open={open} />
      <div
        className={cn(
          "fixed inset-0 z-[100] flex",
          edgeToEdge
            ? "items-stretch justify-stretch p-0"
            : asSheet
              ? "items-end justify-stretch p-0"
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
            "relative z-10 overflow-hidden light-surface bg-popover text-popover-foreground dark:border dark:border-border dark:bg-zinc-900",
            edgeToEdge
              ? "h-full max-h-none w-full rounded-none"
              : asSheet
                ? cn(
                    // Full-bleed bottom sheet — ignore caller max-width / radius.
                    "flex w-full max-w-none flex-col rounded-none rounded-t-[22px]",
                    "pb-[max(1rem,env(safe-area-inset-bottom))]",
                    "shadow-[0_-12px_40px_rgba(0,0,0,0.18)] dark:shadow-[0_-12px_40px_rgba(0,0,0,0.45)]",
                    sheetSize === "tall"
                      ? "min-h-[min(88dvh,760px)] max-h-[94dvh]"
                      : "max-h-[min(88dvh,720px)]",
                  )
                : cn(
                    "max-h-[calc(100vh-2rem)] shadow-[0_16px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_56px_rgba(0,0,0,0.45)]",
                    floating ? SHELL_G3_RADIUS : "rounded-[10px]",
                    className,
                  ),
          )}
          style={asSheet ? { width: "100vw", maxWidth: "100vw" } : undefined}
        >
          {asSheet ? (
            <div className="flex shrink-0 justify-center pt-2.5 pb-1" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
            </div>
          ) : null}
          <div
            className={cn(
              asSheet
                ? "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-1"
                : null,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );

  // Portal so fixed overlays escape transformed / overflow parents in space
  // layouts (otherwise mobile sheets render under chrome or not at all).
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
