"use client";

import { useCallback, useState } from "react";
import {
  Code2,
  Home,
  LayoutGrid,
  Pin,
  Settings,
  Users,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { developmentView } from "@/lib/product-copy";
import { MobileNavSheet } from "@/components/shell/MobileNavSheet";
import { PlatformNavSheet } from "@/components/shell/mobile/PlatformNavSheet";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { SpacesSheet } from "@/components/shell/mobile/SpacesSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import {
  MOBILE_NAV_HEIGHT,
  MOBILE_NAV_INNER_HEIGHT,
  type MobileNavTabId,
  type MobileSheetId,
} from "@/lib/mobile-nav";
import {
  platformTabForNav,
  visiblePlatformMobileTabs,
  type PlatformMobileTabId,
} from "@/lib/platform-mobile-nav";
import { cn } from "@/lib/utils";

const courierTabs: {
  id: MobileNavTabId;
  label: string;
  Icon: typeof Home;
  sheet?: MobileSheetId;
}[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "spaces", label: "Spaces", Icon: LayoutGrid, sheet: "spaces" },
  { id: "pins", label: "Pins", Icon: Pin, sheet: "pins" },
  { id: "workspace", label: "Workspace", Icon: Users, sheet: "workspace" },
  { id: "settings", label: "Settings", Icon: Settings },
];

const navTabClass = (active: boolean) =>
  cn(
    "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-200",
    active
      ? "text-foreground"
      : "text-muted-foreground hover:text-foreground",
  );

export function MobileBottomNav() {
  const {
    product,
    view,
    spaceId,
    threadId,
    platformNav,
    setPlatformNav,
    openCourierHome,
    openDevelopmentOverview,
    openSettings,
    entitlements,
  } = useApp();
  const [sheet, setSheet] = useState<MobileSheetId | null>(null);
  const [platformGroup, setPlatformGroup] =
    useState<PlatformMobileTabId | null>(null);

  const closeSheet = useCallback(() => setSheet(null), []);
  const closePlatformGroup = useCallback(() => setPlatformGroup(null), []);

  const platformTabs = visiblePlatformMobileTabs(
    entitlements.platformNavAllowed,
  );
  const activePlatformTab = platformTabForNav(platformNav);
  const openPlatformTab = platformTabs.find((tab) => tab.id === platformGroup);

  const isOnHome =
    product === "courier" &&
    view === "chat" &&
    !threadId &&
    !spaceId;

  const isOnDevelopmentOverview =
    product === "platform" && platformNav === "overview";

  const homeActive =
    product === "courier" &&
    view !== "space" &&
    view !== "recents" &&
    view !== "settings";
  const spacesActive = view === "space" || view === "recents";
  const settingsActive = view === "settings";

  const isCourierActive = (id: MobileNavTabId) => {
    if (id === "home") return homeActive;
    if (id === "spaces") return spacesActive;
    if (id === "settings") return settingsActive;
    if (id === "pins") return sheet === "pins";
    if (id === "workspace") return sheet === "workspace";
    return false;
  };

  const goToCourierHome = () => {
    openCourierHome();
  };

  const goToDevelopmentOverview = () => {
    openDevelopmentOverview();
  };

  const handleCourierHomeTab = () => {
    closePlatformGroup();
    closeSheet();
    if (isOnHome) {
      if (entitlements.canAccessDevelopment) goToDevelopmentOverview();
      return;
    }
    goToCourierHome();
  };

  const handleDevelopmentTab = () => {
    closePlatformGroup();
    closeSheet();
    if (isOnDevelopmentOverview) {
      goToCourierHome();
      return;
    }
    goToDevelopmentOverview();
  };

  const handlePlatformTab = (tab: (typeof platformTabs)[number]) => {
    closeSheet();
    if (tab.nav) {
      closePlatformGroup();
      setPlatformNav(tab.nav);
      return;
    }
    setPlatformGroup((current) => (current === tab.id ? null : tab.id));
  };

  const handleCourierTab = (tab: (typeof courierTabs)[number]) => {
    if (tab.id === "home") {
      handleCourierHomeTab();
      return;
    }
    if (tab.id === "settings") {
      closeSheet();
      openSettings(undefined, { hub: true });
      return;
    }
    if (!tab.sheet) return;
    setSheet((current) => (current === tab.sheet ? null : tab.sheet!));
  };

  const navColumnCount =
    product === "platform" ? 1 + platformTabs.length : courierTabs.length;

  return (
    <>
      {openPlatformTab ? (
        <MobileNavSheet
          open={platformGroup !== null}
          sheetId="spaces"
          onClose={closePlatformGroup}
        >
          <PlatformNavSheet
            tab={openPlatformTab}
            platformNav={platformNav}
            allowed={entitlements.platformNavAllowed}
            onSelect={(id) => {
              setPlatformNav(id);
              closePlatformGroup();
            }}
          />
        </MobileNavSheet>
      ) : null}
      {product === "courier" ? (
        <>
          <MobileNavSheet
            open={sheet === "spaces"}
            sheetId="spaces"
            onClose={closeSheet}
          >
            <SpacesSheet onSelect={closeSheet} />
          </MobileNavSheet>
          <MobileNavSheet
            open={sheet === "pins"}
            sheetId="pins"
            onClose={closeSheet}
          >
            <PinsSheet onSelect={closeSheet} />
          </MobileNavSheet>
          <MobileNavSheet
            open={sheet === "workspace"}
            sheetId="workspace"
            onClose={closeSheet}
          >
            <WorkspaceSheet onSelect={closeSheet} />
          </MobileNavSheet>
        </>
      ) : null}

      <nav
        aria-label={product === "platform" ? "Development" : "Main"}
        style={{
          height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
      >
        <div
          className="grid h-full w-full items-stretch px-2"
          style={{
            minHeight: MOBILE_NAV_INNER_HEIGHT,
            gridTemplateColumns: `repeat(${navColumnCount}, minmax(0, 1fr))`,
          }}
        >
          {product === "platform" ? (
            <>
              <button
                type="button"
                aria-label={
                  isOnDevelopmentOverview
                    ? "Go to Home"
                    : "Go to Development overview"
                }
                aria-current={isOnDevelopmentOverview ? "page" : undefined}
                onClick={handleDevelopmentTab}
                className={navTabClass(isOnDevelopmentOverview)}
              >
                <Code2 className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                <span className="w-full truncate text-center text-[10px] font-medium tracking-[-0.01em]">
                  {developmentView.label}
                </span>
              </button>
              {platformTabs.map((tab) => {
                const active =
                  platformGroup === tab.id ||
                  (platformGroup === null && activePlatformTab === tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    aria-expanded={
                      tab.items ? platformGroup === tab.id : undefined
                    }
                    onClick={() => handlePlatformTab(tab)}
                    className={navTabClass(active)}
                  >
                    <tab.Icon
                      className="h-5 w-5 shrink-0"
                      strokeWidth={active ? 2 : 1.6}
                    />
                    <span className="w-full truncate text-center text-[10px] font-medium tracking-[-0.01em]">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            courierTabs.map((tab) => {
              const active = isCourierActive(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  aria-expanded={tab.sheet ? sheet === tab.sheet : undefined}
                  onClick={() => handleCourierTab(tab)}
                  className={navTabClass(active)}
                >
                  <tab.Icon
                    className="h-5 w-5 shrink-0"
                    strokeWidth={active ? 2 : 1.6}
                  />
                  <span className="w-full truncate text-center text-[10px] font-medium tracking-[-0.01em]">
                    {tab.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </nav>
    </>
  );
}
