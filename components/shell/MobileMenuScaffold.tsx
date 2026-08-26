"use client";

import type { ReactNode } from "react";
import { useApp } from "@/components/app/AppProvider";
import { MobileMenuPane } from "@/components/shell/MobileMenuPane";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/** Menu width as a fraction of the viewport; the rest stays visible as a peek strip. */
export const MOBILE_MENU_WIDTH = 0.75;

/**
 * ChatGPT-style mobile frame: menu slides in from the left (~75% width) while
 * the app chrome + main content stay visible on the right with rounded corners.
 */
export function MobileMenuScaffold({ children }: { children: ReactNode }) {
  const mobile = useMobileShell();
  const { mobileSurface, setMobileSurface } = useApp();

  if (!mobile) return <>{children}</>;

  const menuOpen = mobileSurface === "menu";
  const peekPct = (1 - MOBILE_MENU_WIDTH) * 100;
  const shiftPct = MOBILE_MENU_WIDTH * 100;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background will-change-transform",
          "transition-[transform,border-radius,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          menuOpen &&
            "rounded-[20px] shadow-[-8px_0_32px_oklch(0_0_0/0.12)]",
        )}
        style={{
          transform: menuOpen ? `translate3d(${shiftPct}%, 0, 0)` : undefined,
        }}
      >
        {children}
      </div>

      <div
        aria-hidden={!menuOpen}
        className={cn(
          "absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden bg-background",
          "transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
          menuOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        style={{ width: `${MOBILE_MENU_WIDTH * 100}%` }}
      >
        <MobileMenuPane />
      </div>

      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="absolute inset-y-0 right-0 z-30"
          style={{ width: `${peekPct}%` }}
          onClick={() => setMobileSurface("chat")}
        />
      ) : null}
    </div>
  );
}
