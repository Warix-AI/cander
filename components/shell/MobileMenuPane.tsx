"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pin,
  SquarePen,
  UserRound,
} from "lucide-react";
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

type MenuScreen = "main" | "pinned" | "workspace" | "account";

/**
 * Full-screen menu pane for the mobile pager.
 * Main list is fixed; Pinned / Workspace / Account open scrollable sub-screens.
 */
export function MobileMenuPane() {
  const {
    view,
    spaceId,
    threadId,
    workspace,
    mobileSurface,
    setMobileSurface,
    newChat,
    openSpaceChat,
    openSpace,
    openRecents,
    openBrowser,
  } = useApp();
  const items = useMainNavItems();
  const [screen, setScreen] = useState<MenuScreen>("main");

  useEffect(() => {
    if (mobileSurface !== "menu") setScreen("main");
  }, [mobileSurface]);

  const close = () => {
    setScreen("main");
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

  if (screen !== "main") {
    const title =
      screen === "pinned"
        ? "Pinned"
        : screen === "workspace"
          ? "Workspace"
          : "Account";
    return (
      <aside className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex h-12 shrink-0 items-center gap-1 px-2">
          <button
            type="button"
            aria-label="Back to menu"
            onClick={() => setScreen("main")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/70"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <p className="text-[15px] font-medium tracking-[-0.01em]">{title}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {screen === "pinned" ? (
            <PinsSheet onSelect={close} hideHeading />
          ) : null}
          {screen === "workspace" ? (
            <WorkspaceSheet onSelect={close} />
          ) : null}
          {screen === "account" ? <AccountSheet onSelect={close} /> : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-12 shrink-0 items-center px-4">
        <p className="text-[15px] font-medium tracking-[-0.01em]">Menu</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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

        <div className="mt-auto space-y-0.5 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setScreen("pinned")}
            className={rowClass}
          >
            <Pin
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <span className="min-w-0 flex-1 text-left">Pinned</span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
            />
          </button>
          <button
            type="button"
            onClick={() => setScreen("workspace")}
            className={rowClass}
          >
            <WorkspaceMark
              id={workspace.id}
              name={workspace.name}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate text-left">
              {workspace.name}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
            />
          </button>
          <button
            type="button"
            onClick={() => setScreen("account")}
            className={rowClass}
          >
            <UserRound
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <span className="min-w-0 flex-1 text-left">Account</span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}
