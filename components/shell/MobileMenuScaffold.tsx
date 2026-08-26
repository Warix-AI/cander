"use client";

import type { ReactNode } from "react";
import { useApp } from "@/components/app/AppProvider";
import { MobileMenuPane } from "@/components/shell/MobileMenuPane";
import { useMobileShell } from "@/lib/use-media-query";
import {
  MOBILE_APP_BG,
  MOBILE_MENU_BG,
  MOBILE_PEEK_RADIUS,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

/** Menu width as a fraction of the viewport; the rest stays visible as a peek strip. */
export const MOBILE_MENU_WIDTH = 0.75;

/**
 * ChatGPT-style mobile frame: menu slides in from the left (~75% width) while
 * the active screen stays visible on the right with G3 rounded corners.
 */
export function MobileMenuScaffold({ children }: { children: ReactNode }) {
  const mobile = useMobileShell();
  const { mobileSurface, setMobileSurface } = useApp();

  if (!mobile) return <>{children}</>;

  const menuOpen = mobileSurface === "menu";
  const peekPct = (1 - MOBILE_MENU_WIDTH) * 100;
  const shiftPct = MOBILE_MENU_WIDTH * 100;

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        MOBILE_MENU_BG,
      )}
    >
      {/* Menu canvas fills the rounded-corner gaps behind the peek strip. */}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", MOBILE_MENU_BG)}
      />
      <div
        className={cn(
          "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden will-change-transform",
          MOBILE_APP_BG,
          "transition-[transform,border-radius] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          menuOpen && MOBILE_PEEK_RADIUS,
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
          "absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden",
          MOBILE_MENU_BG,
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
