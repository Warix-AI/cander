"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Composer-sized, panel-local navigation. The containing panel reserves its bottom space. */
export function MobileFloatingNav({ children, activeId, label = "Sections" }: {
  children: ReactNode;
  activeId: string;
  label?: string;
}) {
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
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.7rem))] sm:px-6 lg:hidden">
      <nav ref={navRef} aria-label={label}
        className="pointer-events-auto mx-auto flex h-14 w-full max-w-3xl items-center gap-1 overflow-x-auto overscroll-x-contain rounded-[28px] border border-border/60 bg-background/95 px-2 shadow-[0_4px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </nav>
    </div>
  );
}
