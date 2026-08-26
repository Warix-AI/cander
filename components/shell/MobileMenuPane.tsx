"use client";

import { SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountSheet } from "@/components/shell/mobile/AccountSheet";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { isChatSpace, isExtraNavId, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const rowClass =
  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-sidebar-accent";

/**
 * Full-screen menu pane for the mobile pager (not an overlay drawer).
 */
export function MobileMenuPane() {
  const {
    view,
    spaceId,
    threadId,
    setMobileSurface,
    newChat,
    openSpaceChat,
    openSpace,
    openRecents,
    openBrowser,
  } = useApp();
  const items = useMainNavItems();

  const close = () => setMobileSurface("chat");
  const chatActive = view === "chat" && !threadId && !spaceId;

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    if (id === "research" && view === "browser") return true;
    return spaceId === id && (view === "space" || view === "chat");
  };

  const openNav = (id: SidebarNavId) => {
    if (id === "browser") openBrowser();
    else if (id === "recents") openRecents();
    else if (!isExtraNavId(id)) {
      if (isChatSpace(id)) openSpaceChat(id);
      else openSpace(id as SpaceId);
    }
    close();
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 shrink-0 items-center px-4">
        <p className="text-[15px] font-medium tracking-[-0.01em]">Menu</p>
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
          {items.map(({ id, label, Icon }) => {
            const active = navActive(id);
            const tinted =
              id === "work" || id === "build" || id === "research";
            return (
              <button
                key={id}
                type="button"
                onClick={() => openNav(id)}
                className={cn(rowClass, active && "bg-sidebar-accent font-medium")}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    tinted ? spaceIconTint(id) : "text-muted-foreground",
                  )}
                  strokeWidth={2}
                />
                {label}
              </button>
            );
          })}
        </div>

        <p className="mt-4 px-3 pb-1 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Pinned
        </p>
        <PinsSheet onSelect={close} />

        <p className="mt-3 px-3 pb-1 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Workspace
        </p>
        <WorkspaceSheet onSelect={close} />
      </div>

      <div className="shrink-0 border-t border-sidebar-border px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <AccountSheet onSelect={close} />
      </div>
    </aside>
  );
}
