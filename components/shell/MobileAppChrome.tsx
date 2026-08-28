"use client";

import { useSyncExternalStore, type TouchEventHandler } from "react";
import {
  ChevronLeft,
  Ellipsis,
  ExternalLink,
  GitCompare,
  Globe,
  Menu,
  MousePointer2,
  Plus,
  RotateCw,
  SquarePen,
  SquareStack,
  Upload,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { previewAddress } from "@/components/panels/PreviewChrome";
import { Dropdown } from "@/components/ui/Controls";
import {
  MobilePanelActionsCluster,
  useMobilePanelActionsState,
} from "@/components/shell/mobile/MobilePanelActions";
import { navLabel } from "@/lib/use-main-nav-items";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { isChatSpace, PRIMARY_NAV_SPACES } from "@/lib/spaces";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import {
  MOBILE_APP_BG,
  mobileChromeButtonClass,
} from "@/lib/mobile-menu-styles";
import type { BuildTool, MobileSurface, OverlayId, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const ADVANCED_TOOLS: { id: BuildTool; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "editor", label: "Code" },
  { id: "terminal", label: "Terminal" },
  { id: "git", label: "Git" },
  { id: "logs", label: "Logs" },
  { id: "dependencies", label: "Dependencies" },
  { id: "env", label: "Environment variables" },
  { id: "database", label: "Database" },
];

/**
 * ChatGPT-style mobile top bar.
 * Content: menu · Chat|{Space} · new chat
 * Menu / settings sub-screens: back · title · (+ create workspace)
 */
export function MobileAppChrome({ className }: { className?: string }) {
  const {
    view,
    spaceId,
    projectId,
    project,
    connectorId,
    entitlements,
    mobileSurface,
    setMobileSurface,
    mobileMenuScreen,
    setMobileMenuScreen,
    setPanelMode,
    newChat,
    openSpaceChat,
    settingsMobileHub,
    settingsTab,
    settingsWorkspaceId,
    setSettingsWorkspaceId,
    backToSettingsHub,
    closeSettings,
    popEntityNavigation,
    buildTool,
    setBuildTool,
    liveUrl,
    refreshPreview,
    openOverlay,
    selectMode,
    setSelectMode,
    advancedMode,
    setAdvancedMode,
  } = useApp();

  const catalog = useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );

  const inSettings = view === "settings";
  const inMenuSub =
    mobileSurface === "menu" && mobileMenuScreen !== "main";
  const inChromeSub = inMenuSub || inSettings;
  const onMenuMain = mobileSurface === "menu" && mobileMenuScreen === "main";

  const inPrimarySpace =
    Boolean(spaceId) &&
    (PRIMARY_NAV_SPACES as readonly string[]).includes(spaceId as string);
  const inConnector =
    spaceId === "connectors" && Boolean(connectorId);
  const entityOpen = Boolean(projectId) || inConnector;
  const showEntityBack =
    entityOpen && !inChromeSub && !onMenuMain && mobileSurface !== "menu";
  const showSpaceToggle =
    !inChromeSub &&
    !onMenuMain &&
    (inPrimarySpace || inConnector) &&
    (view === "space" || (view === "chat" && Boolean(spaceId)));

  const settingsNav = visibleSettingsTabs(entitlements);
  const workspaceName = settingsWorkspaceId
    ? catalog.find((item) => item.id === settingsWorkspaceId)?.name
    : null;
  const settingsTitle = settingsMobileHub
    ? "Settings"
    : workspaceName && settingsTab === "workspaces"
      ? workspaceName
      : (settingsNav.find((tab) => tab.id === settingsTab)?.label ??
        "Settings");

  const subTitle = inSettings
    ? settingsTitle
    : mobileMenuScreen === "pinned"
      ? "Pinned"
      : mobileMenuScreen === "workspace"
        ? "Workspace"
        : "";

  const spaceLabel = spaceId ? navLabel(spaceId as SpaceId) ?? "Space" : "Space";
  const panelTabLabel = inConnector ? "Connector" : spaceLabel;
  const surface: MobileSurface =
    mobileSurface === "menu"
      ? "menu"
      : mobileSurface === "panel"
        ? "panel"
        : "chat";

  const showBuildTools =
    !inChromeSub &&
    !onMenuMain &&
    spaceId === "build" &&
    Boolean(projectId);
  const showCreateWorkspace =
    inSettings &&
    !settingsMobileHub &&
    settingsTab === "workspaces" &&
    !settingsWorkspaceId &&
    (entitlements.canCreatePersonalWorkspace ||
      entitlements.canCreateBusinessWorkspace);
  const hideNewChat =
    onMenuMain || inChromeSub || showBuildTools || showCreateWorkspace;

  const panelActionsCtx = useMobilePanelActionsState();
  const panelActions = panelActionsCtx?.actions;
  const showPanelActions = Boolean(
    panelActions &&
    !onMenuMain &&
    !inChromeSub &&
    !showBuildTools &&
    !showCreateWorkspace &&
    (view === "recents" ||
      (view === "space" && mobileSurface === "panel" && !entityOpen)),
  );

  const startNewChat = () => {
    if (spaceId && isChatSpace(spaceId)) {
      newChat(spaceId);
      return;
    }
    newChat();
  };

  const startPanelNewChat = () => {
    if (spaceId && isChatSpace(spaceId)) {
      newChat(spaceId);
      return;
    }
    newChat();
  };

  const preview = previewAddress(project?.name);
  const address = liveUrl ?? preview.url;

  const onLeadingClick = () => {
    if (showEntityBack) {
      popEntityNavigation();
      return;
    }
    if (inSettings) {
      if (settingsWorkspaceId) {
        setSettingsWorkspaceId(null);
        return;
      }
      if (!settingsMobileHub) {
        backToSettingsHub();
        return;
      }
      closeSettings();
      setMobileMenuScreen("main");
      setMobileSurface("menu");
      return;
    }
    if (inMenuSub) {
      setMobileMenuScreen("main");
      return;
    }
    if (mobileSurface === "menu") {
      setMobileSurface("chat");
      return;
    }
    setMobileSurface("menu");
  };

  const setChatOrPanel = (next: "chat" | "panel") => {
    if (!showSpaceToggle) return;
    if (next === "panel") {
      setMobileSurface("panel");
      return;
    }
    if (projectId) {
      setMobileSurface("chat");
      return;
    }
    if (spaceId && isChatSpace(spaceId)) {
      openSpaceChat(spaceId);
      return;
    }
    setMobileSurface("chat");
  };

  const stopSwipe: TouchEventHandler = (event) => {
    event.stopPropagation();
  };

  // Menu main: chrome stays on the peek strip; hamburger toggles the drawer closed.
  const centerChrome =
    !onMenuMain && (inChromeSub || showSpaceToggle) ? (
      inChromeSub ? (
        <p className="truncate text-center text-[15px] font-medium tracking-[-0.01em]">
          {subTitle}
        </p>
      ) : showSpaceToggle ? (
        <div
          role="tablist"
          aria-label="Surface"
          className="inline-flex max-w-full items-center rounded-full bg-muted/70 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={surface === "chat"}
            onClick={() => setChatOrPanel("chat")}
            className={cn(
              "rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
              surface === "chat"
                ? "bg-white text-foreground shadow-sm dark:bg-neutral-900"
                : "text-muted-foreground",
            )}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={surface === "panel"}
            onClick={() => setChatOrPanel("panel")}
            className={cn(
              "max-w-[9rem] truncate rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
              surface === "panel"
                ? "bg-white text-foreground shadow-sm dark:bg-neutral-900"
                : "text-muted-foreground",
            )}
          >
            {panelTabLabel}
          </button>
        </div>
      ) : null
    ) : null;

  return (
    <header
      data-no-swipe=""
      onTouchStart={stopSwipe}
      onTouchEnd={stopSwipe}
      className={cn(
        "shrink-0",
        MOBILE_APP_BG,
        "pt-[calc(env(safe-area-inset-top,0px)+6px)]",
        className,
      )}
    >
      <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center px-3">
        <div className={cn("relative z-10 justify-self-start", mobileSurface === "menu" && "ml-2.5")}>
          <button
            type="button"
            aria-label={
              showEntityBack
                ? "Back"
                : inChromeSub
                  ? "Back"
                  : mobileSurface === "menu"
                    ? "Close menu"
                    : "Open menu"
            }
            onClick={onLeadingClick}
            className={mobileChromeButtonClass}
          >
            {showEntityBack || inChromeSub ? (
              <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.8} />
            )}
          </button>
        </div>

        <div className="relative z-0 flex min-w-0 max-w-full justify-center justify-self-center px-2">
          {centerChrome}
        </div>

        <div className="relative z-10 flex items-center justify-self-end gap-0.5">
          {showBuildTools ? (
            <BuildToolsMenu
              address={address}
              buildTool={buildTool}
              setBuildTool={setBuildTool}
              refreshPreview={refreshPreview}
              openOverlay={openOverlay}
              selectMode={selectMode}
              setSelectMode={setSelectMode}
              advancedMode={advancedMode}
              setAdvancedMode={setAdvancedMode}
              setMobileSurface={setMobileSurface}
              setPanelMode={setPanelMode}
            />
          ) : showCreateWorkspace ? (
          <button
            type="button"
            aria-label="Create workspace"
            onClick={() => openOverlay("workspace")}
            className={mobileChromeButtonClass}
          >
            <Plus className="h-5 w-5" strokeWidth={1.8} />
          </button>
        ) : showPanelActions && panelActions ? (
          <MobilePanelActionsCluster
            config={panelActions}
            onNewChat={startPanelNewChat}
          />
        ) : hideNewChat ? (
          <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
        ) : (
          <button
            type="button"
            aria-label="New chat"
            onClick={startNewChat}
            className={mobileChromeButtonClass}
          >
            <SquarePen className="h-5 w-5" strokeWidth={1.8} />
          </button>
          )}
        </div>
      </div>
    </header>
  );
}

function BuildToolsMenu({
  address,
  buildTool,
  setBuildTool,
  refreshPreview,
  openOverlay,
  selectMode,
  setSelectMode,
  advancedMode,
  setAdvancedMode,
  setMobileSurface,
  setPanelMode,
}: {
  address: string;
  buildTool: BuildTool;
  setBuildTool: (id: BuildTool) => void;
  refreshPreview: () => void;
  openOverlay: (id: OverlayId) => void;
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  advancedMode: boolean;
  setAdvancedMode: (on: boolean) => void;
  setMobileSurface: (s: MobileSurface) => void;
  setPanelMode: (mode: "collapsed" | "split" | "wide" | "immersive") => void;
}) {
  const changing = buildTool === "activity";
  const previewing = buildTool === "preview";

  const goTool = (id: BuildTool, close: () => void) => {
    setBuildTool(id);
    setPanelMode("split");
    setMobileSurface("panel");
    close();
  };

  return (
    <Dropdown
      align="end"
      matchTrigger={false}
      menuClassName="min-w-[14rem] max-h-[70vh] overflow-y-auto"
      trigger={({ toggle }) => (
        <button
          type="button"
          aria-label="Build tools"
          onClick={toggle}
          className={mobileChromeButtonClass}
        >
          <Ellipsis className="h-5 w-5" strokeWidth={1.8} />
        </button>
      )}
    >
      {(close) => (
        <>
          <ChromeMenuItem
            icon={GitCompare}
            active={changing}
            onClick={() => goTool(changing ? "preview" : "activity", close)}
          >
            Changes
          </ChromeMenuItem>
          <ChromeMenuItem
            icon={Globe}
            active={previewing}
            onClick={() => goTool("preview", close)}
          >
            Live preview
          </ChromeMenuItem>
          <ChromeMenuItem
            icon={ExternalLink}
            onClick={() => {
              window.open(address, "_blank");
              close();
            }}
          >
            Open externally
          </ChromeMenuItem>
          <ChromeMenuItem
            icon={Upload}
            onClick={() => {
              openOverlay("publish");
              close();
            }}
          >
            Publish
          </ChromeMenuItem>
          <ChromeMenuItem
            icon={MousePointer2}
            active={selectMode}
            onClick={() => {
              setSelectMode(!selectMode);
              setMobileSurface("panel");
              close();
            }}
          >
            Select element
          </ChromeMenuItem>
          <ChromeMenuItem
            icon={RotateCw}
            onClick={() => {
              refreshPreview();
              close();
            }}
          >
            Refresh
          </ChromeMenuItem>
          <div className="my-1.5 mx-2 h-px bg-border" />
          <p className="px-3 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Advanced tools
          </p>
          {advancedMode ? (
            ADVANCED_TOOLS.map((item) => (
              <ChromeMenuItem
                key={item.id}
                active={buildTool === item.id}
                onClick={() => goTool(item.id, close)}
              >
                {item.label}
              </ChromeMenuItem>
            ))
          ) : (
            <p className="px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              Files, Terminal, and Git stay hidden until you need them.
            </p>
          )}
          <ChromeMenuItem
            onClick={() => {
              setAdvancedMode(!advancedMode);
              close();
            }}
          >
            {advancedMode ? "Hide advanced tools" : "Show advanced tools"}
          </ChromeMenuItem>
        </>
      )}
    </Dropdown>
  );
}

function ChromeMenuItem({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: string;
  active?: boolean;
  onClick: () => void;
  icon?: typeof Globe;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] tracking-[-0.01em] hover:bg-muted",
        active && "bg-muted",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} /> : null}
      {children}
    </button>
  );
}
