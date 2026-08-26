"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Pin, Settings, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { isChatSpace, isExtraNavId, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const rowClass =
  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted/70";

/**
 * Full-screen menu pane for the mobile pager.
 * New chat + nav + pinned; Workspace and Settings at the bottom.
 */
export function MobileMenuPane() {
  const {
    view,
    spaceId,
    threadId,
    mobileSurface,
    setMobileSurface,
    mobileMenuScreen,
    setMobileMenuScreen,
    newChat,
    openSpaceChat,
    openSpace,
    openRecents,
    openBrowser,
    openSettings,
  } = useApp();
  const items = useMainNavItems();

  useEffect(() => {
    if (mobileSurface !== "menu") setMobileMenuScreen("main");
  }, [mobileSurface, setMobileMenuScreen]);

  const onMenuMain = mobileSurface === "menu" && mobileMenuScreen === "main";
  /** Only paint nav selection while the menu pane is visible — avoids highlight sliding away. */
  const showNavSelection = onMenuMain;

  const closeMenuOnly = () => {
    setMobileMenuScreen("main");
  };
  const closeToChat = () => {
    setMobileMenuScreen("main");
    setMobileSurface("chat");
  };

  const chatActive = view === "chat" && !threadId && !spaceId;

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    if (id === "research" && view === "browser") return true;
    return spaceId === id && (view === "space" || view === "chat");
  };

  const openNav = (id: SidebarNavId) => {
    if (id === "browser") openBrowser();
    else if (id === "recents") {
      openRecents();
      closeToChat();
      return;
    } else if (!isExtraNavId(id)) {
      if (isChatSpace(id)) openSpaceChat(id);
      else openSpace(id as SpaceId);
    }
    // Let openSpace / openSpaceChat own mobileSurface — don't force chat.
    closeMenuOnly();
  };

  const startNewChat = () => {
    if (
      spaceId &&
      isChatSpace(spaceId) &&
      (view === "space" || view === "chat")
    ) {
      newChat(spaceId);
    } else {
      newChat();
    }
    closeToChat();
  };

  const navRows: Array<
    | { kind: "nav"; id: SidebarNavId; label: string; Icon: LucideIcon }
    | { kind: "pinned" }
  > = [];
  let pinnedInserted = false;
  for (const item of items) {
    navRows.push({ kind: "nav", ...item });
    if (item.id === "recents") {
      navRows.push({ kind: "pinned" });
      pinnedInserted = true;
    }
  }
  if (!pinnedInserted) navRows.push({ kind: "pinned" });

  if (mobileMenuScreen === "pinned" || mobileMenuScreen === "workspace") {
    return (
      <aside className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
          {mobileMenuScreen === "pinned" ? (
            <PinsSheet onSelect={closeToChat} hideHeading />
          ) : (
            <WorkspaceSheet onSelect={() => {}} />
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <div>
          <button
            type="button"
            onClick={startNewChat}
            className={cn(
              rowClass,
              showNavSelection && chatActive && "bg-muted/70 font-medium",
            )}
          >
            <SquarePen
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            New chat
          </button>

          {navRows.map((row) => {
            if (row.kind === "pinned") {
              return (
                <button
                  key="pinned"
                  type="button"
                  onClick={() => setMobileMenuScreen("pinned")}
                  className={rowClass}
                >
                  <Pin
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  Pinned
                </button>
              );
            }
            const active = navActive(row.id);
            const tinted =
              row.id === "work" || row.id === "build" || row.id === "research";
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => openNav(row.id)}
                className={cn(
                  rowClass,
                  showNavSelection && active && "bg-muted/70 font-medium",
                )}
              >
                <row.Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    tinted
                      ? spaceIconTint(row.id as SpaceId)
                      : "text-muted-foreground",
                  )}
                  strokeWidth={2}
                />
                {row.label}
              </button>
            );
          })}
        </div>

        <div className="mt-auto space-y-0.5">
          <button
            type="button"
            onClick={() => setMobileMenuScreen("workspace")}
            className={rowClass}
          >
            <LayoutGrid
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            Workspace
          </button>
          <button
            type="button"
            onClick={() => {
              openSettings(undefined, { hub: true });
              setMobileMenuScreen("main");
              setMobileSurface("chat");
            }}
            className={rowClass}
          >
            <Settings
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            Settings
          </button>
        </div>
      </div>
    </aside>
  );
}
