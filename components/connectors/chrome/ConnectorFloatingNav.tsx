"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { setMobileFloatingNavReserve } from "@/lib/mobile-floating-nav-chrome";
import { cn } from "@/lib/utils";

/** Bottom padding so scroll content clears the floating nav (mobile + desktop panel). */
export const CONNECTOR_FLOATING_NAV_PAD =
  "pb-[calc(5rem+env(safe-area-inset-bottom,0px))]";

/**
 * Floating bottom section nav for multi-section connectors.
 * Same pattern on mobile and desktop right-panel — no separate top tab strip.
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
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(10px,calc(env(safe-area-inset-bottom)+10px))] sm:px-4",
        className,
      )}
    >
      <nav
        ref={navRef}
        aria-label={label}
        className={cn(
          "mobile-floating-nav mobile-glass-pill pointer-events-auto mx-auto flex h-14 w-full max-w-3xl items-center gap-1 overflow-x-auto overscroll-x-contain rounded-[28px] border border-border/60 px-2",
          // Desktop / wide panel fallback when mobile glass tokens are not active.
          "bg-background/90 shadow-[0_8px_28px_oklch(0_0_0/0.08)] backdrop-blur-xl",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
        "h-10 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60",
      )}
    >
      {label}
    </button>
  );
}
