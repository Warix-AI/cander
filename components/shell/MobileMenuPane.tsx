"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, LayoutGrid, Pin, Settings, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { CourierMark } from "@/components/brand/CourierMark";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { isChatSpace, isExtraNavId, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const rowClass =
  "flex w-full items-center gap-3.5 rounded-[12px] px-4 py-3.5 text-left text-[16px] tracking-[-0.02em] transition-colors duration-200 hover:bg-muted/70";

/**
 * Left drawer menu for mobile — slides over ~75% width; main screen peeks on the right.
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
    const subTitle =
      mobileMenuScreen === "pinned" ? "Pinned" : "Workspace";
    return (
      <aside className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
          <button
            type="button"
            aria-label="Back"
            onClick={() => setMobileMenuScreen("main")}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/70"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <p className="truncate text-[17px] font-medium tracking-[-0.02em]">
            {subTitle}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
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
      <div className="flex shrink-0 items-center px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <CourierMark className="!h-[26px] !w-[27px]" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={startNewChat}
            className={cn(
              rowClass,
              showNavSelection && chatActive && "bg-muted/70 font-medium",
            )}
          >
            <SquarePen
              className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
              strokeWidth={1.9}
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
                    className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
                    strokeWidth={1.9}
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
                    "h-[18px] w-[18px] shrink-0",
                    tinted
                      ? spaceIconTint(row.id as SpaceId)
                      : "text-muted-foreground",
                  )}
                  strokeWidth={1.9}
                />
                {row.label}
              </button>
            );
          })}
        </div>

        <div className="mt-auto space-y-0.5 pt-4">
          <button
            type="button"
            onClick={() => setMobileMenuScreen("workspace")}
            className={rowClass}
          >
            <LayoutGrid
              className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
              strokeWidth={1.9}
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
              className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
              strokeWidth={1.9}
            />
            Settings
          </button>
        </div>
      </div>
    </aside>
  );
}
