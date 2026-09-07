"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  LayoutGrid,
  PanelsTopLeft,
  Pin,
  Settings,
  SquarePen,
} from "lucide-react";
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
import { closeAllPinSections } from "@/lib/pin-display-prefs";
import { navLabel, useMainNavItems } from "@/lib/use-main-nav-items";
import { isComingSoonNav, isExtraNavId, navSpaceMatches, type SidebarNavId } from "@/lib/spaces";
import { navIcon } from "@/lib/space-icons";
import type { MobileMenuScreen, NavDestinationId } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOBILE_SECONDARY_NAV: SidebarNavId[] = ["connectors", "recents"];

/**
 * Left drawer menu for mobile — slides over ~75% width; main screen peeks on the right.
 */
export function MobileMenuPane() {
  const {
    view,
    spaceId,
    projectId,
    connectorId,
    mobileSurface,
    setMobileSurface,
    mobileMenuScreen,
    setMobileMenuScreen,
    newChat,
    openSpace,
    openRecents,
    openBrowser,
    openSettings,
  } = useApp();

  useEffect(() => {
    if (mobileSurface !== "menu") setMobileMenuScreen("main");
  }, [mobileSurface, setMobileMenuScreen]);

  const stackDepth =
    mobileMenuScreen === "main"
      ? 0
      : mobileMenuScreen === "workspace-general"
        ? 2
        : 1;
  const direction = useMobileStackDirection(stackDepth);

  const openNav = (id: SidebarNavId) => {
    if (isComingSoonNav(id)) return;
    closeAllPinSections();
    const opensPanel = id === "connectors";
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
    setMobileSurface(opensPanel ? "panel" : "chat");
  };

  const openSettingsFromMenu = () => {
    closeAllPinSections();
    openSettings(undefined, { hub: true });
    setMobileMenuScreen("main");
    setMobileSurface("chat");
  };

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
            projectId={projectId}
            connectorId={connectorId}
            onNewChat={() => {
              closeAllPinSections();
              newChat();
              setMobileSurface("chat");
            }}
            onOpenScreen={setMobileMenuScreen}
            onOpenNav={openNav}
          />
        ) : (
          <MenuSub
            screen={mobileMenuScreen}
            onBack={() =>
              setMobileMenuScreen(
                mobileMenuScreen === "workspace-general" ? "general" : "main",
              )
            }
            onSelect={(options) => {
              setMobileMenuScreen("main");
              setMobileSurface(options?.landOnPanel ? "panel" : "chat");
            }}
            onOpenScreen={setMobileMenuScreen}
            onOpenNav={openNav}
            onOpenSettings={openSettingsFromMenu}
          />
        )}
      </MobileSlideStack>
    </aside>
  );
}

function MenuMain({
  view,
  spaceId,
  projectId,
  connectorId,
  onNewChat,
  onOpenScreen,
  onOpenNav,
}: {
  view: string;
  spaceId: NavDestinationId | null;
  projectId: string | null;
  connectorId: string | null;
  onNewChat: () => void;
  onOpenScreen: (screen: MobileMenuScreen) => void;
  onOpenNav: (id: SidebarNavId) => void;
}) {
  const spaceItems = useMainNavItems({ spacesOnly: true });
  const newActive =
    view === "chat" && !spaceId && !projectId && !connectorId;

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
      </div>

      <div className="mt-[30px] flex min-h-0 flex-1 flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-[0.1rem]">
          <button
            type="button"
            onClick={onNewChat}
            className={cn(
              mobileMenuRowClass,
              newActive && mobileMenuRowActiveClass,
            )}
            aria-label="New"
          >
            <SquarePen
              className={cn(MOBILE_MENU_ICON_SIZE, "text-muted-foreground")}
              strokeWidth={MOBILE_MENU_ICON_STROKE}
            />
            <span className="min-w-0 flex-1 truncate">New</span>
          </button>
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

        <div className="mt-auto pt-3">
          <button
            type="button"
            onClick={() => onOpenScreen("general")}
            className={mobileMenuRowClass}
          >
            <PanelsTopLeft
              className={cn(
                MOBILE_MENU_ICON_SIZE,
                "shrink-0 text-muted-foreground",
              )}
              strokeWidth={MOBILE_MENU_ICON_STROKE}
            />
            General
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
        comingSoon
          ? "cursor-default opacity-70"
          : active
            ? mobileMenuRowActiveClass
            : undefined,
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
  onOpenScreen,
  onOpenNav,
  onOpenSettings,
}: {
  screen: MobileMenuScreen;
  onBack: () => void;
  onSelect: (options?: { landOnPanel?: boolean }) => void;
  onOpenScreen: (screen: MobileMenuScreen) => void;
  onOpenNav: (id: SidebarNavId) => void;
  onOpenSettings: () => void;
}) {
  const title =
    screen === "pinned"
      ? "Pinned"
      : screen === "workspace" || screen === "workspace-general"
        ? "Workspace"
        : "General";

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
        ) : screen === "workspace" || screen === "workspace-general" ? (
          <WorkspaceSheet onSelect={onSelect} />
        ) : (
          <GeneralSheet
            onOpenWorkspace={() => onOpenScreen("workspace-general")}
            onOpenNav={onOpenNav}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>
    </>
  );
}

function GeneralSheet({
  onOpenWorkspace,
  onOpenNav,
  onOpenSettings,
}: {
  onOpenWorkspace: () => void;
  onOpenNav: (id: SidebarNavId) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="space-y-px">
      <button
        type="button"
        onClick={onOpenWorkspace}
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
      {MOBILE_SECONDARY_NAV.map((id) => {
        const Icon = navIcon(id);
        const label = navLabel(id);
        if (!label) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onOpenNav(id)}
            className={mobileMenuRowClass}
          >
            <Icon
              className={cn(
                MOBILE_MENU_ICON_SIZE,
                "shrink-0 text-muted-foreground",
              )}
              strokeWidth={MOBILE_MENU_ICON_STROKE}
            />
            {label}
          </button>
        );
      })}
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
  );
}
