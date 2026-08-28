"use client";

import { useEffect, useState, useSyncExternalStore, type TouchEventHandler } from "react";
import { ChevronLeft, Ellipsis, Menu, Plus, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import {
  MobileBottomSheet,
  ProjectActionsSheetBody,
} from "@/components/browser/ProjectMobileSheets";
import { previewAddress } from "@/components/panels/PreviewChrome";
import {
  MobilePanelActionsCluster,
  useMobilePanelActionsState,
} from "@/components/shell/mobile/MobilePanelActions";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { normalizeProjectTitle } from "@/lib/project-name";
import { navLabel } from "@/lib/use-main-nav-items";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { isChatSpace, PRIMARY_NAV_SPACES } from "@/lib/spaces";
import { previewUrlForProject } from "@/lib/preview-url";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import {
  MOBILE_APP_BG,
  mobileChromeButtonClass,
} from "@/lib/mobile-menu-styles";
import type { MobileSurface, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    liveUrl,
    refreshPreview,
    openOverlay,
    selectMode,
    setSelectMode,
  } = useApp();

  const catalog = useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const { updateProject } = useSpaceMutation();
  const { ctx } = useSpaceData();

  const inSettings = view === "settings";
  const inMenuSub =
    mobileSurface === "menu" && mobileMenuScreen !== "main";
  const inChromeSub = inMenuSub || inSettings;
  const onMenuMain = mobileSurface === "menu" && mobileMenuScreen === "main";

  const inPrimarySpace =
    Boolean(spaceId) &&
    (PRIMARY_NAV_SPACES as readonly string[]).includes(spaceId as string);
  const inConnector = spaceId === "connectors" && Boolean(connectorId);
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

  const showProjectTools =
    !inChromeSub && !onMenuMain && Boolean(projectId) && inPrimarySpace;
  const showCreateWorkspace =
    inSettings &&
    !settingsMobileHub &&
    settingsTab === "workspaces" &&
    !settingsWorkspaceId &&
    (entitlements.canCreatePersonalWorkspace ||
      entitlements.canCreateBusinessWorkspace);
  const hideNewChat =
    onMenuMain || inChromeSub || showProjectTools || showCreateWorkspace;

  const panelActionsCtx = useMobilePanelActionsState();
  const panelActions = panelActionsCtx?.actions;
  const showPanelActions = Boolean(
    panelActions &&
      !onMenuMain &&
      !inChromeSub &&
      !showProjectTools &&
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
  const address = liveUrl ?? previewUrlForProject(projectId ?? "project") ?? preview.url;
  const published = Boolean(liveUrl && !liveUrl.includes("localhost"));
  const canRename = spaceId === "build" || spaceId === "research";
  const projectTitle = project?.name ?? "Project";

  useEffect(() => {
    if (!actionsOpen) return;
    setRenameValue(projectTitle);
    setRenameError(null);
  }, [actionsOpen, projectTitle]);

  const saveProjectName = async () => {
    if (!projectId || !canRename) return;
    const next = normalizeProjectTitle(renameValue);
    if (!next) {
      setRenameError("Project name is required.");
      return;
    }
    if (next === projectTitle) {
      setRenameError(null);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await updateProject(ctx, projectId, { title: next });
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename project.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

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
    <>
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
          <div
            className={cn(
              "relative z-10 justify-self-start",
              mobileSurface === "menu" && "ml-2.5",
            )}
          >
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
            {showProjectTools ? (
              <button
                type="button"
                aria-label="Project tools"
                onClick={() => setActionsOpen(true)}
                className={mobileChromeButtonClass}
              >
                <Ellipsis className="h-5 w-5" strokeWidth={1.8} />
              </button>
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

      <MobileBottomSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        mode="actions"
      >
        <ProjectActionsSheetBody
          published={published}
          statusNote={
            published
              ? "Your website is up to date."
              : "Publish to share a live link."
          }
          address={address}
          selectMode={selectMode}
          canRename={canRename}
          projectName={projectTitle}
          renameValue={renameValue}
          renameError={renameError}
          renameBusy={renameBusy}
          onRenameChange={setRenameValue}
          onRenameSave={() => void saveProjectName()}
          onPublish={() => {
            openOverlay("publish");
            setActionsOpen(false);
          }}
          onOpenExternal={() => {
            window.open(address, "_blank");
            setActionsOpen(false);
          }}
          onSelectElement={() => {
            setSelectMode(!selectMode);
            setPanelMode("split");
            setMobileSurface("panel");
            setActionsOpen(false);
          }}
          onRefresh={() => {
            refreshPreview();
            setActionsOpen(false);
          }}
          onCopyAddress={() => {
            void navigator.clipboard?.writeText(address);
          }}
        />
      </MobileBottomSheet>
    </>
  );
}
