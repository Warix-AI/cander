"use client";

import { useEffect } from "react";
import { Pin, SquarePen, UserRound } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountSheet } from "@/components/shell/mobile/AccountSheet";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { isChatSpace, isExtraNavId, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const rowClass =
  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted/70";

/**
 * Full-screen menu pane for the mobile pager.
 * Main list is fixed; Pinned / Workspace / Account open as sub-screens
 * (chrome title/back live in MobileAppChrome).
 */
export function MobileMenuPane() {
  const {
    view,
    spaceId,
    threadId,
    workspace,
    mobileSurface,
    setMobileSurface,
    mobileMenuScreen,
    setMobileMenuScreen,
    newChat,
    openSpaceChat,
    openSpace,
    openRecents,
    openBrowser,
  } = useApp();
  const items = useMainNavItems();

  useEffect(() => {
    if (mobileSurface !== "menu") setMobileMenuScreen("main");
  }, [mobileSurface, setMobileMenuScreen]);

  const close = () => {
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
    else if (id === "recents") openRecents();
    else if (!isExtraNavId(id)) {
      if (isChatSpace(id)) openSpaceChat(id);
      else openSpace(id as SpaceId);
    }
    close();
  };

  if (mobileMenuScreen !== "main") {
    return (
      <aside className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
          {mobileMenuScreen === "pinned" ? (
            <PinsSheet onSelect={close} hideHeading />
          ) : null}
          {mobileMenuScreen === "workspace" ? (
            <WorkspaceSheet onSelect={close} />
          ) : null}
          {mobileMenuScreen === "account" ? (
            <AccountSheet onSelect={close} />
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        <button
          type="button"
          onClick={() => {
            newChat();
            close();
          }}
          className={cn(rowClass, chatActive && "bg-muted/70 font-medium")}
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
                className={cn(rowClass, active && "bg-muted/70 font-medium")}
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

        <div className="mt-auto space-y-0.5">
          <button
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
          <button
            type="button"
            onClick={() => setMobileMenuScreen("workspace")}
            className={rowClass}
          >
            <WorkspaceMark
              id={workspace.id}
              name={workspace.name}
              size="nav"
            />
            <span className="min-w-0 truncate">{workspace.name}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuScreen("account")}
            className={rowClass}
          >
            <UserRound
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            Account
          </button>
        </div>
      </div>
    </aside>
  );
}
