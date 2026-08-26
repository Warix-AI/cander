"use client";

import { useSyncExternalStore, type TouchEventHandler } from "react";
import {
  ChevronDown,
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
import { navLabel } from "@/lib/use-main-nav-items";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { isChatSpace, PRIMARY_NAV_SPACES } from "@/lib/spaces";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
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
    panelMode,
    setPanelMode,
    newChat,
    settingsMobileHub,
    settingsTab,
    settingsWorkspaceId,
    setSettingsWorkspaceId,
    backToSettingsHub,
    closeSettings,
    backToSpaceHome,
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
  const panelTabLabel = inConnector
    ? "Connector"
    : spaceLabel;
  const backLabel = inConnector
    ? "Connectors"
    : spaceLabel;
  const surface =
    mobileSurface === "menu"
      ? "menu"
      : panelMode !== "collapsed" && mobileSurface === "panel"
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
    setMobileSurface("chat");
  };

  const preview = previewAddress(project?.name);
  const address = liveUrl ?? preview.url;

  const onLeadingClick = () => {
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
    if (onMenuMain) {
      setMobileSurface("chat");
      return;
    }
    setMobileSurface("menu");
  };

  const setChatOrPanel = (next: "chat" | "panel") => {
    if (!showSpaceToggle) return;
    if (panelMode === "collapsed") setPanelMode("split");
    setMobileSurface(next);
  };

  const stopSwipe: TouchEventHandler = (event) => {
    event.stopPropagation();
  };

  return (
    <header
      data-no-swipe=""
      onTouchStart={stopSwipe}
      onTouchEnd={stopSwipe}
      className={cn(
        "shrink-0 bg-background",
        "pt-[env(safe-area-inset-top,0px)]",
        className,
      )}
    >
      <div className="flex h-12 items-center gap-2 px-3">
        <button
          type="button"
          aria-label={inChromeSub ? "Back" : "Open menu"}
          onClick={onLeadingClick}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
        >
          {inChromeSub ? (
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center">
          {onMenuMain ? null : inChromeSub ? (
            <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
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
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Chat
              </button>
              {entityOpen ? (
                <Dropdown
                  align="end"
                  matchTrigger={false}
                  menuClassName="min-w-[11rem]"
                  trigger={({ open, toggle }) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={surface === "panel"}
                      aria-expanded={open}
                      onClick={() => {
                        if (surface !== "panel") setChatOrPanel("panel");
                        else toggle();
                      }}
                      className={cn(
                        "inline-flex max-w-[9rem] items-center gap-1 truncate rounded-full px-3 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
                        surface === "panel"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground",
                      )}
                    >
                      <span className="truncate">{panelTabLabel}</span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-transform",
                          open && "rotate-180",
                        )}
                        strokeWidth={1.8}
                      />
                    </button>
                  )}
                >
                  {(close) => (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        backToSpaceHome();
                        close();
                      }}
                      className="menu-row-hover flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[13px]"
                    >
                      Back to {backLabel}
                    </button>
                  )}
                </Dropdown>
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={surface === "panel"}
                  onClick={() => setChatOrPanel("panel")}
                  className={cn(
                    "max-w-[9rem] truncate rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
                    surface === "panel"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {panelTabLabel}
                </button>
              )}
            </div>
          ) : null}
        </div>

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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-5 w-5" strokeWidth={1.8} />
          </button>
        ) : hideNewChat ? (
          <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
        ) : (
          <button
            type="button"
            aria-label="New chat"
            onClick={startNewChat}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
          >
            <SquarePen className="h-5 w-5" strokeWidth={1.8} />
          </button>
        )}
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
  const moreOpen = buildTool === "more";

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
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
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
            icon={SquareStack}
            active={moreOpen}
            onClick={() => goTool("more", close)}
          >
            More
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
