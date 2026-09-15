"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { House, PanelLeft, PanelRight } from "lucide-react";
import { AdminChatColumn } from "@/components/admin/AdminChatColumn";
import { AdminNavPanel } from "@/components/admin/AdminNavPanel";
import { AdminSearchModal } from "@/components/admin/AdminSearchModal";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { useAdmin } from "@/components/admin/AdminProvider";
import {
  BrowserChromeIconButton,
  clearBrowserChromeHovers,
} from "@/components/shell/PanelToggle";
import { ADMIN_SECTION_LABELS, ADMIN_SECTIONS } from "@/lib/admin/sections";
import { APP_NAME } from "@/lib/app-brand";
import {
  DEFAULT_PANEL_RATIO,
  PINNED_CHAT_WIDTH,
} from "@/lib/right-panel";
import {
  PRIMARY_NAV_CARD_ACTIVE,
  PRIMARY_NAV_CARD_HOVER,
  PRIMARY_NAV_CARD_RADIUS_FIRST,
  PRIMARY_NAV_CARD_RADIUS_LAST,
  PRIMARY_NAV_CARD_RADIUS_SOLO,
  MOBILE_MENU_BG,
  MOBILE_APP_BG,
} from "@/lib/mobile-menu-styles";
import { SHELL_G3_RADIUS, setShellStyle } from "@/lib/shell-chrome";
import {
  DESKTOP_TITLEBAR_PX,
  DESKTOP_TRAFFIC_CLEAR_PX,
  isDesktopShell,
} from "@/lib/desktop-shell";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { syncNativeShellTheme } from "@/lib/native-shell-theme";

/**
 * Product shell column map:
 * Sidebar (admin links) · ChatColumn · ContextPanel (section workspace).
 */
export function AdminShell() {
  const mobile = useMobileShell();
  const {
    section,
    setSection,
    mobileSurface,
    setMobileSurface,
    navCollapsed,
    setNavCollapsed,
    panelCollapsed,
    setPanelCollapsed,
    panelImmersive,
  } = useAdmin();
  const dragging = useRef(false);
  const [panelRatio, setPanelRatio] = useState(DEFAULT_PANEL_RATIO);

  // Match AppShell: keep Electron titlebar vars alive on /admin. Leaving the
  // main app unmounts AppShell and strips `cander-desktop`, which zeroed the
  // titlebar and crushed admin chrome into the top edge.
  useEffect(() => {
    if (!isDesktopShell()) return;
    const root = document.documentElement;
    root.classList.add("cander-desktop");
    root.style.setProperty("--desktop-titlebar", `${DESKTOP_TITLEBAR_PX}px`);
    root.style.setProperty(
      "--desktop-traffic-clear",
      `${DESKTOP_TRAFFIC_CLEAR_PX}px`,
    );
    syncNativeShellTheme();
    return () => {
      root.classList.remove("cander-desktop");
    };
  }, []);

  // Match AppShell: desktop is always classic so titlebar / traffic-light
  // insets aren't skipped by a leftover "floating" preference.
  useEffect(() => {
    setShellStyle(mobile ? "floating" : "classic");
  }, [mobile]);

  const onPanelDrag = useCallback((clientX: number, container: HTMLElement) => {
    const rect = container.getBoundingClientRect();
    const fromRight = (rect.right - clientX) / rect.width;
    setPanelRatio(Math.min(0.78, Math.max(0.42, fromRight)));
  }, []);

  if (mobile) {
    return (
      <div
        className={cn(
          "flex h-svh min-h-0 flex-col overflow-hidden text-foreground",
          MOBILE_MENU_BG,
        )}
      >
        <AdminSearchModal />
        {mobileSurface === "menu" ? (
          <div className="flex min-h-0 flex-1 flex-col bg-sidebar">
            <div className="px-3 pt-4 pb-2">
              <div
                className={cn(
                  "flex w-full flex-col gap-0 p-[3px]",
                  SHELL_G3_RADIUS,
                  "bg-black/[0.03] dark:bg-white/[0.045]",
                )}
              >
                <Link
                  href="/"
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-1.5 text-left text-[15px] transition-colors duration-200",
                    PRIMARY_NAV_CARD_RADIUS_SOLO,
                    PRIMARY_NAV_CARD_HOVER,
                  )}
                  aria-label={`Back to ${APP_NAME}`}
                >
                  <House
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span className="min-w-0 flex-1 truncate tracking-[-0.01em]">
                    {APP_NAME}
                  </span>
                </Link>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2">
              <div
                className={cn(
                  "flex flex-col gap-0 p-[3px]",
                  SHELL_G3_RADIUS,
                  "bg-black/[0.03] dark:bg-white/[0.045]",
                )}
              >
                {ADMIN_SECTIONS.map((id, index) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "w-full px-3 py-2.5 text-left text-[15px] transition-colors",
                      index === 0 && PRIMARY_NAV_CARD_RADIUS_FIRST,
                      index === ADMIN_SECTIONS.length - 1 &&
                        PRIMARY_NAV_CARD_RADIUS_LAST,
                      section === id
                        ? PRIMARY_NAV_CARD_ACTIVE
                        : PRIMARY_NAV_CARD_HOVER,
                    )}
                    onClick={() => {
                      setSection(id);
                      setMobileSurface("workspace");
                    }}
                  >
                    {ADMIN_SECTION_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 border-t border-sidebar-border p-3">
              <Link
                href="/"
                className="flex-1 rounded-full border border-border px-3 py-2 text-center text-xs"
              >
                App
              </Link>
              <button
                type="button"
                className="flex-1 rounded-full bg-foreground px-3 py-2 text-xs text-background"
                onClick={() => setMobileSurface("chat")}
              >
                Chat
              </button>
            </div>
          </div>
        ) : (
          <div className={cn("flex min-h-0 flex-1 flex-col", MOBILE_APP_BG)}>
            <div className="flex h-11 items-center gap-1 border-b border-border/40 px-2">
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted"
                onClick={() => setMobileSurface("menu")}
              >
                Menu
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[13px]",
                  mobileSurface === "chat"
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )}
                onClick={() => setMobileSurface("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[13px]",
                  mobileSurface === "workspace"
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )}
                onClick={() => setMobileSurface("workspace")}
              >
                {ADMIN_SECTION_LABELS[section]}
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div
                className={cn(
                  "absolute inset-0 transition-transform duration-300",
                  mobileSurface === "chat"
                    ? "translate-x-0"
                    : "-translate-x-full",
                )}
              >
                <AdminChatColumn className="h-full" />
              </div>
              <div
                className={cn(
                  "absolute inset-0 transition-transform duration-300",
                  mobileSurface === "workspace"
                    ? "translate-x-0"
                    : "translate-x-full",
                )}
              >
                <AdminWorkspace className="h-full" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-app-shell=""
      className="relative flex h-svh min-h-0 overflow-hidden bg-background text-foreground"
    >
      <AdminSearchModal />
      {!navCollapsed ? (
        <div className="hidden h-full shrink-0 lg:flex">
          <AdminNavPanel />
        </div>
      ) : (
        <button
          type="button"
          className="absolute left-3 top-[calc(var(--desktop-titlebar,0px)+0.65rem)] z-30 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Open left panel"
          onClick={() => setNavCollapsed(false)}
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.6} />
        </button>
      )}

      <div
        id="admin-main"
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {!panelImmersive ? (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              !panelCollapsed ? PINNED_CHAT_WIDTH : "min-w-0 flex-1",
            )}
          >
            <AdminChatColumn className="h-full" />
          </div>
        ) : null}

        {!panelCollapsed ? (
          <>
            {!panelImmersive ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize admin workspace"
                className="relative z-10 w-px shrink-0 cursor-col-resize bg-border/40 hover:bg-chart-2/50"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  dragging.current = true;
                  const main = document.getElementById("admin-main");
                  if (!main) return;
                  const move = (ev: PointerEvent) => {
                    if (!dragging.current) return;
                    onPanelDrag(ev.clientX, main);
                  };
                  const up = () => {
                    dragging.current = false;
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
            ) : null}
            <div
              className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden"
              style={
                panelImmersive
                  ? { width: "100%", minWidth: "20rem" }
                  : {
                      width: `${panelRatio * 100}%`,
                      minWidth: "20rem",
                      maxWidth: "78%",
                    }
              }
            >
              <AdminWorkspace className="h-full" />
            </div>
          </>
        ) : (
          <div
            className="pointer-events-none absolute top-0 right-0 z-50 hidden h-11 items-center gap-1 px-3 lg:flex"
            onPointerLeave={clearBrowserChromeHovers}
          >
            <span className="pointer-events-auto">
              <BrowserChromeIconButton
                aria-label="Open right panel"
                onClick={() => setPanelCollapsed(false)}
              >
                <PanelRight className="h-3.5 w-3.5" strokeWidth={1.6} />
              </BrowserChromeIconButton>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
