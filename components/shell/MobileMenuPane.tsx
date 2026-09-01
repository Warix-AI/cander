"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, LayoutGrid, Pin, Settings, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { CanderWordmark } from "@/components/brand/CanderWordmark";
import {
  MobileSlideStack,
  useMobileStackDirection,
} from "@/components/shell/mobile/MobileSlideStack";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import {
  MOBILE_MENU_BG,
  MOBILE_MENU_ICON_SIZE,
  MOBILE_MENU_ICON_STROKE,
  mobileMenuRowActiveClass,
  mobileMenuRowClass,
} from "@/lib/mobile-menu-styles";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { isExtraNavId, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import type { MobileMenuScreen, NavDestinationId } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    openSpace,
    openRecents,
    openBrowser,
    openSettings,
    entitlements,
  } = useApp();

  useEffect(() => {
    if (mobileSurface !== "menu") setMobileMenuScreen("main");
  }, [mobileSurface, setMobileMenuScreen]);

  useEffect(() => {
    if (!entitlements.hasWorkspaces && mobileMenuScreen === "workspace") {
      setMobileMenuScreen("main");
    }
  }, [entitlements.hasWorkspaces, mobileMenuScreen, setMobileMenuScreen]);

  const stackDepth = mobileMenuScreen === "main" ? 0 : 1;
  const direction = useMobileStackDirection(stackDepth);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden text-foreground",
        MOBILE_MENU_BG,
      )}
    >
      <MobileSlideStack
        activeKey={mobileMenuScreen}
        direction={direction}
        frameClassName={MOBILE_MENU_BG}
      >
        {mobileMenuScreen === "main" ? (
          <MenuMain
            view={view}
            spaceId={spaceId}
            threadId={threadId}
            showWorkspaces={entitlements.hasWorkspaces}
            onNewChat={() => {
              newChat();
            }}
            onOpenScreen={setMobileMenuScreen}
            onOpenNav={(id) => {
              if (id === "browser") {
                openBrowser();
              } else if (id === "recents") {
                openRecents();
              } else if (id === "connectors") {
                openSpace("connectors");
              } else if (!isExtraNavId(id)) {
                openSpace(id);
              }
              setMobileMenuScreen("main");
            }}
            onOpenSettings={() => {
              openSettings(undefined, { hub: true });
              setMobileMenuScreen("main");
              setMobileSurface("chat");
            }}
          />
        ) : (
          <MenuSub
            screen={mobileMenuScreen}
            onBack={() => setMobileMenuScreen("main")}
            onSelect={() => {
              setMobileMenuScreen("main");
              setMobileSurface("chat");
            }}
          />
        )}
      </MobileSlideStack>
    </aside>
  );
}

function MenuMain({
  view,
  spaceId,
  threadId,
  showWorkspaces,
  onNewChat,
  onOpenScreen,
  onOpenNav,
  onOpenSettings,
}: {
  view: string;
  spaceId: NavDestinationId | null;
  threadId: string | null;
  showWorkspaces: boolean;
  onNewChat: () => void;
  onOpenScreen: (screen: MobileMenuScreen) => void;
  onOpenNav: (id: SidebarNavId) => void;
  onOpenSettings: () => void;
}) {
  const items = useMainNavItems();
  const chatActive = view === "chat" && !threadId && !spaceId;

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    return spaceId === id && (view === "space" || view === "chat");
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

  return (
    <>
      <div className="flex shrink-0 items-center px-3 pl-7 pt-[calc(env(safe-area-inset-top,0px)+22px)]">
        <CanderWordmark />
      </div>

      <div className="mt-[30px] flex min-h-0 flex-1 flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="space-y-px">
          <button
            type="button"
            onClick={onNewChat}
            className={cn(
              mobileMenuRowClass,
              chatActive && mobileMenuRowActiveClass,
            )}
          >
            <SquarePen
              className={cn(
                MOBILE_MENU_ICON_SIZE,
                "shrink-0 text-muted-foreground",
              )}
              strokeWidth={MOBILE_MENU_ICON_STROKE}
            />
            New chat
          </button>

          {navRows.map((row) => {
            if (row.kind === "pinned") {
              return (
                <button
                  key="pinned"
                  type="button"
                  onClick={() => onOpenScreen("pinned")}
                  className={mobileMenuRowClass}
                >
                  <Pin
                    className={cn(
                      MOBILE_MENU_ICON_SIZE,
                      "shrink-0 text-muted-foreground",
                    )}
                    strokeWidth={MOBILE_MENU_ICON_STROKE}
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
                onClick={() => onOpenNav(row.id)}
                className={cn(
                  mobileMenuRowClass,
                  active && mobileMenuRowActiveClass,
                )}
              >
                <row.Icon
                  className={cn(
                    MOBILE_MENU_ICON_SIZE,
                    "shrink-0",
                    tinted
                      ? spaceIconTint(
                          row.id === "work" ||
                            row.id === "build" ||
                            row.id === "research"
                            ? row.id
                            : null,
                        )
                      : "text-muted-foreground",
                  )}
                  strokeWidth={MOBILE_MENU_ICON_STROKE}
                />
                {row.label}
              </button>
            );
          })}
        </div>

        <div className="mt-auto space-y-px pt-3">
          {showWorkspaces ? (
            <button
              type="button"
              onClick={() => onOpenScreen("workspace")}
              className={mobileMenuRowClass}
            >
              <LayoutGrid
                className={cn(
                  MOBILE_MENU_ICON_SIZE,
                  "shrink-0 text-muted-foreground",
                )}
                strokeWidth={MOBILE_MENU_ICON_STROKE}
              />
              Workspace
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenSettings}
            className={mobileMenuRowClass}
          >
            <Settings
              className={cn(
                MOBILE_MENU_ICON_SIZE,
                "shrink-0 text-muted-foreground",
              )}
              strokeWidth={MOBILE_MENU_ICON_STROKE}
            />
            Settings
          </button>
        </div>
      </div>
    </>
  );
}

function MenuSub({
  screen,
  onBack,
  onSelect,
}: {
  screen: MobileMenuScreen;
  onBack: () => void;
  onSelect: () => void;
}) {
  const title = screen === "pinned" ? "Pinned" : "Workspace";

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.1} />
        </button>
        <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">
          {title}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
        {screen === "pinned" ? (
          <PinsSheet onSelect={onSelect} hideHeading />
        ) : (
          <WorkspaceSheet onSelect={onSelect} />
        )}
      </div>
    </>
  );
}
