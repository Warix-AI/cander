"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { setMobileFloatingNavReserve } from "@/lib/mobile-floating-nav-chrome";
import { cn } from "@/lib/utils";

/** Match ChatColumn / Composer dock bottom inset. */
export const COMPOSER_DOCK_BOTTOM_PAD =
  "pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.7rem))] sm:pb-4";

/** Bottom padding so scroll content clears the floating nav (mobile + desktop panel). */
export const CONNECTOR_FLOATING_NAV_PAD =
  "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]";

/**
 * Floating bottom section nav for multi-section connectors.
 * Same glass, height, and bottom inset as the chat composer bar.
 */
export function ConnectorFloatingNav({
  children,
  activeId,
  label = "Sections",
  className,
}: {
  children: ReactNode;
  activeId: string;
  label?: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const bounds = nav.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < bounds.left) nav.scrollLeft -= bounds.left - item.left + 8;
    if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right + 8;
  }, [activeId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const publish = () => {
      setMobileFloatingNavReserve(el.getBoundingClientRect().height);
    };
    publish();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener("resize", publish);
    window.addEventListener("orientationchange", publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
      window.removeEventListener("orientationchange", publish);
      setMobileFloatingNavReserve(0);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 sm:px-4",
        COMPOSER_DOCK_BOTTOM_PAD,
        className,
      )}
    >
      <nav
        ref={navRef}
        aria-label={label}
        className={cn(
          // Same frosted pill + vertical rhythm as .composer-shell (py-1.5 + ~32px row).
          "shell-glass-pill mobile-floating-nav pointer-events-auto flex min-h-[44px] w-fit max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain px-1.5 py-1.5",
          "rounded-[20px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {children}
      </nav>
    </div>
  );
}

export function ConnectorFloatingNavItem({
  id,
  label,
  active,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      data-nav-id={id}
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60",
      )}
    >
      {label}
    </button>
  );
}
