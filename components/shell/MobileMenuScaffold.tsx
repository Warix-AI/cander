"use client";

import { useEffect, type ReactNode } from "react";
import { useApp } from "@/components/app/AppProvider";
import { MobileMenuPane } from "@/components/shell/MobileMenuPane";
import { useMobileShell } from "@/lib/use-media-query";
import {
  MOBILE_APP_BG,
  MOBILE_MENU_BG,
  MOBILE_PAGER_MS,
  MOBILE_PEEK_RADIUS,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

/** Menu width as a fraction of the viewport; the rest stays visible as a peek strip. */
export const MOBILE_MENU_WIDTH = 0.75;

const MENU_EASE =
  "duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]";

/**
 * ChatGPT-style mobile frame: menu and main surface move by the same delta so
 * open and close are one continuous LTR / RTL slide — no separate menu pop-in.
 */
export function MobileMenuScaffold({ children }: { children: ReactNode }) {
  const mobile = useMobileShell();
  const { mobileSurface, mobileContentSurface, setMobileSurface } = useApp();

  const menuOpen = mobileSurface === "menu";
  const menuWidth = `calc(${MOBILE_MENU_WIDTH * 100}% + 5px)`;
  const peekPct = (1 - MOBILE_MENU_WIDTH) * 100;

  // After close, clear any iOS scroll/viewport hitch left by keyboard + transform.
  useEffect(() => {
    if (!mobile || menuOpen) return;
    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    };
    reset();
    const id = window.setTimeout(reset, MOBILE_PAGER_MS + 32);
    return () => window.clearTimeout(id);
  }, [mobile, menuOpen]);

  if (!mobile) return <>{children}</>;

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        MOBILE_MENU_BG,
      )}
    >
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", MOBILE_MENU_BG)}
      />

      <div
        aria-hidden={!menuOpen}
        className={cn(
          "absolute inset-y-0 left-0 z-10 flex flex-col overflow-hidden",
          MOBILE_MENU_BG,
          "transition-transform",
          MENU_EASE,
          menuOpen && "will-change-transform",
          !menuOpen && "pointer-events-none",
        )}
        style={{
          width: menuWidth,
          transform: menuOpen
            ? "translate3d(0, 0, 0)"
            : `translate3d(calc(-1 * (${menuWidth})), 0, 0)`,
        }}
      >
        <MobileMenuPane />
      </div>

      <div
        className={cn(
          "relative z-20 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          MOBILE_APP_BG,
          "transition-[transform,border-radius,background-color,box-shadow]",
          MENU_EASE,
          menuOpen && "will-change-transform",
          menuOpen && MOBILE_PEEK_RADIUS,
          menuOpen && "mobile-menu-peek",
          // While open, the slid-over surface must not intercept menu taps
          // (iOS WKWebView hit-testing can still hit the transformed layer).
          menuOpen && "pointer-events-none",
        )}
        style={{
          transform: menuOpen
            ? `translate3d(${menuWidth}, 0, 0)`
            : "translate3d(0, 0, 0)",
        }}
      >
        {children}
      </div>

      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          data-allow-swipe=""
          className="pointer-events-auto absolute inset-y-0 right-0 z-30"
          style={{ width: `calc(${peekPct}% - 5px)` }}
          onClick={() => setMobileSurface(mobileContentSurface)}
        />
      ) : null}
    </div>
  );
}
