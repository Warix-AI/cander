"use client";

import { useEffect } from "react";
import { SquarePen, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountSheet } from "@/components/shell/mobile/AccountSheet";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { isChatSpace, isComingSoonNav, isExtraNavId, navSpaceMatches, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMobileShell } from "@/lib/use-media-query";

const rowClass =
  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-sidebar-accent";

/**
 * Left overlay menu for mobile — desktop sidebar destinations.
 * Driven by `sidebarOpen` (desktop still uses the real Sidebar).
 */
export function MobileMenuDrawer() {
  const mobile = useMobileShell();
  const {
    view,
    spaceId,
    threadId,
    sidebarOpen,
    setSidebarOpen,
    newChat,
    openSpaceChat,
    openSpace,
    openRecents,
    openBrowser,
  } = useApp();
  const items = useMainNavItems();

  useEffect(() => {
    if (!mobile) return;
    // Start closed on phone; desktop keeps its own default.
    setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per mobile session
  }, [mobile]);

  if (!mobile) return null;

  const close = () => setSidebarOpen(false);
  const chatActive = view === "chat" && !threadId && !spaceId;

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    return (
      navSpaceMatches(id, spaceId) && (view === "space" || view === "chat")
    );
  };

  const openNav = (id: SidebarNavId) => {
    if (isComingSoonNav(id)) return;
    if (id === "browser") openBrowser();
    else if (id === "recents") openRecents();
    else if (isChatSpace(id)) openSpaceChat(id);
    else openSpace(id);
    close();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={close}
        className={cn(
          "fixed inset-0 z-[60] bg-foreground/25 transition-opacity duration-200 lg:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-[70] flex w-[min(20rem,86vw)] flex-col bg-sidebar text-sidebar-foreground shadow-[8px_0_32px_oklch(0_0_0/0.18)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between px-3">
          <p className="px-1 text-[13px] font-medium tracking-[-0.01em]">Menu</p>
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">
          <button
            type="button"
            onClick={() => {
              newChat();
              close();
            }}
            className={cn(rowClass, chatActive && "bg-sidebar-accent font-medium")}
          >
            <SquarePen
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            New Chat
          </button>

          <div className="mt-1">
            {items.map(({ id, label, Icon, comingSoon }) => {
              const active = navActive(id);
              const tinted =
                id === "home" ||
                id === "work" ||
                id === "build" ||
                id === "research" ||
                id === "studio";
              return (
                <button
                  key={id}
                  type="button"
                  disabled={comingSoon}
                  aria-disabled={comingSoon || undefined}
                  onClick={() => openNav(id)}
                  className={cn(
                    rowClass,
                    active && "bg-sidebar-accent font-medium",
                    comingSoon && "cursor-default opacity-70",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      tinted ? spaceIconTint(id as SpaceId) : "text-muted-foreground",
                    )}
                    strokeWidth={2}
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {comingSoon ? (
                    <span className="shrink-0 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Coming soon
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <PinsSheet onSelect={close} />

          <p className="mt-3 px-3 pb-1 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            Workspace
          </p>
          <WorkspaceSheet onSelect={close} />
        </div>

        <div className="shrink-0 border-t border-sidebar-border px-1 py-2">
          <AccountSheet onSelect={close} />
        </div>
      </aside>
    </>
  );
}
