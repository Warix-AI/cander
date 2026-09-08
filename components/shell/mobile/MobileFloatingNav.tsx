"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { setMobileFloatingNavReserve } from "@/lib/mobile-floating-nav-chrome";

/** Composer-sized floating nav over panel content (does not reserve layout space). */
export function MobileFloatingNav({ children, activeId, label = "Sections" }: {
  children: ReactNode;
  activeId: string;
  label?: string;
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

  // Publish outer height so native browser surfaces leave this strip uncovered.
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
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-[21px] pb-[max(0.125rem,calc(env(safe-area-inset-bottom)+0.075rem))] sm:px-[29px] lg:hidden"
    >
      <nav ref={navRef} aria-label={label}
        className="mobile-floating-nav mobile-glass-pill pointer-events-auto mx-auto flex h-14 w-full max-w-3xl items-center gap-1 overflow-x-auto overscroll-x-contain rounded-[28px] border border-border/60 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </nav>
    </div>
  );
}
