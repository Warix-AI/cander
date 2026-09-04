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
  mobileChromeButtonClass,
  mobileMenuRowActiveClass,
  mobileMenuRowClass,
} from "@/lib/mobile-menu-styles";
import { navLabel, useMainNavItems } from "@/lib/use-main-nav-items";
import { isComingSoonNav, isExtraNavId, navSpaceMatches, type SidebarNavId } from "@/lib/spaces";
import { navIcon } from "@/lib/space-icons";
import type { MobileMenuScreen, NavDestinationId, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOBILE_SECONDARY_NAV: SidebarNavId[] = ["connectors", "recents"];

/**
 * Left drawer menu for mobile — slides over ~75% width; main screen peeks on the right.
 */
export function MobileMenuPane() {
  const {
    view,
    spaceId,
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
            showWorkspaces={entitlements.hasWorkspaces}
            onNewChat={() => {
              newChat();
              setMobileSurface("chat");
            }}
            onOpenScreen={setMobileMenuScreen}
            onOpenNav={(id) => {
              if (isComingSoonNav(id)) return;
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
  showWorkspaces,
  onNewChat,
  onOpenScreen,
  onOpenNav,
  onOpenSettings,
}: {
  view: string;
  spaceId: NavDestinationId | null;
  showWorkspaces: boolean;
  onNewChat: () => void;
  onOpenScreen: (screen: MobileMenuScreen) => void;
  onOpenNav: (id: SidebarNavId) => void;
  onOpenSettings: () => void;
}) {
  const spaceItems = useMainNavItems({ spacesOnly: true });

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    return (
      navSpaceMatches(id, spaceId) && (view === "space" || view === "chat")
    );
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pl-7 pr-3 pt-[calc(env(safe-area-inset-top,0px)+22px)]">
        <CanderWordmark />
        <button
          type="button"
          aria-label="New chat"
          onClick={onNewChat}
          className={mobileChromeButtonClass}
        >
          <SquarePen className="h-5 w-5" strokeWidth={1.8} />
        </button>
      </div>

      <div className="mt-[30px] flex min-h-0 flex-1 flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="space-y-px">
          {spaceItems.map((item) => (
            <MobileNavRow
              key={item.id}
              id={item.id}
              label={item.label}
              Icon={item.Icon}
              active={navActive(item.id)}
              comingSoon={item.comingSoon}
              onOpen={onOpenNav}
            />
          ))}

          <button
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
        </div>

        <div className="mt-auto space-y-px pt-3">
          {MOBILE_SECONDARY_NAV.map((id) => {
            const Icon = navIcon(id);
            const label = navLabel(id);
            if (!label) return null;
            return (
              <MobileNavRow
                key={id}
                id={id}
                label={label}
                Icon={Icon}
                active={navActive(id)}
                onOpen={onOpenNav}
              />
            );
          })}
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

function MobileNavRow({
  id,
  label,
  Icon,
  active,
  comingSoon,
  onOpen,
}: {
  id: SidebarNavId;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  comingSoon?: boolean;
  onOpen: (id: SidebarNavId) => void;
}) {
  const tinted =
    id === "home" ||
    id === "work" ||
    id === "build" ||
    id === "research" ||
    id === "studio";

  return (
    <button
      type="button"
      disabled={comingSoon}
      aria-disabled={comingSoon || undefined}
      onClick={() => onOpen(id)}
      className={cn(
        mobileMenuRowClass,
        active && mobileMenuRowActiveClass,
        comingSoon && "cursor-default opacity-70",
      )}
    >
      <Icon
        className={cn(
          MOBILE_MENU_ICON_SIZE,
          "shrink-0",
          tinted ? "text-foreground" : "text-muted-foreground",
        )}
        strokeWidth={MOBILE_MENU_ICON_STROKE}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {comingSoon ? (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Coming soon
        </span>
      ) : null}
    </button>
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
