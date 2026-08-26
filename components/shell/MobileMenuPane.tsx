"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Pin, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { planLabel } from "@/lib/billing";
import { isChatSpace, isExtraNavId, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const rowClass =
  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted/70";

/**
 * Full-screen menu pane for the mobile pager.
 * Pinned sits under Recents; Workspace opens a sub-screen; Account opens Settings.
 */
export function MobileMenuPane() {
  const {
    view,
    spaceId,
    threadId,
    actor,
    entitlements,
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

  const close = () => {
    setMobileMenuScreen("main");
    setMobileSurface("chat");
  };
  const chatActive = view === "chat" && !threadId && !spaceId;

  const accountTag = entitlements.orgActive
    ? entitlements.role
    : entitlements.showInviteWall
      ? `${planLabel(entitlements.plan)} · invite pending`
      : planLabel(entitlements.plan);

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
            <PinsSheet onSelect={close} hideHeading />
          ) : (
            <WorkspaceSheet
              onSelect={() => {}}
              onCreate={() => {
                setMobileMenuScreen("main");
                setMobileSurface("chat");
              }}
            />
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
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
                className={cn(rowClass, active && "bg-muted/70 font-medium")}
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
            <AccountAvatar
              memberId={actor.id}
              name={actor.name}
              initials={actor.initials}
              size="sm"
              className="!rounded-full"
            />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate">{actor.name}</span>
              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                {accountTag}
              </span>
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
