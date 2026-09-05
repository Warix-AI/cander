"use client";

import { useEffect, useState, useSyncExternalStore, type TouchEventHandler } from "react";
import { ChevronLeft, ChevronRight, Ellipsis, Menu, Plus, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import {
  MobileBottomSheet,
  ProjectActionsSheetBody,
  ProjectRenameSheetBody,
} from "@/components/browser/ProjectMobileSheets";
import { previewAddress } from "@/components/panels/PreviewChrome";
import {
  MobilePanelActionsCluster,
  useMobilePanelActionsState,
} from "@/components/shell/mobile/MobilePanelActions";
import { canvasStartOptions } from "@/lib/canvas-start-options";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { useSpaceMutation, useSpaceProject } from "@/lib/hooks/use-space-query";
import { normalizeProjectTitle } from "@/lib/project-name";
import { navLabel } from "@/lib/use-main-nav-items";
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import {
  isChatSpace,
  isDashboardOnlySpace,
  isDockChatSpace,
  PRIMARY_NAV_SPACES,
} from "@/lib/spaces";
import { previewUrlForProject } from "@/lib/preview-url";
import {
  findWorkCollectionItem,
  isWorkItemBrowserProjectId,
} from "@/lib/work-item-browser";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import {
  MOBILE_APP_BG,
  SPACE_CANVAS_BG,
  mobileChromeButtonClass,
} from "@/lib/mobile-menu-styles";
import type { MobileSurface, SpaceId } from "@/lib/types";
import { isNewChatScreen } from "@/lib/right-panel";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style mobile top bar.
 * Content: menu · Chat|{Space} · new chat
 * In-project: back · project name (actions) · forward to panel / ⋯ on panel
 * Menu / settings sub-screens: back · title · (+ create workspace)
 */
export function MobileAppChrome({ className }: { className?: string }) {
  const {
    view,
    spaceId,
    projectId,
    project,
    connectorId,
    jobId,
    skillId,
    drafting,
    thread,
    threadId,
    entitlements,
    mobileSurface,
    mobileContentSurface,
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
    openProject,
    openQuickSearchBrowser,
    selectMode,
    setSelectMode,
    backToSpaceHome,
    openInAppBrowser,
  } = useApp();

  const catalog = useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { updateProject } = useSpaceMutation();
  const { ctx } = useSpaceData();
  const { project: entityProject } = useSpaceProject(projectId);
  const {
    openCreate,
    busy: newProjectBusy,
    modal: createProjectModal,
  } = useCreateProjectFlow(openProject);

  const inSettings = view === "settings";
  const inMenuSub =
    mobileSurface === "menu" && mobileMenuScreen !== "main";
  const inChromeSub = inMenuSub || inSettings;
  const onMenuMain = mobileSurface === "menu" && mobileMenuScreen === "main";

  const inPrimarySpace =
    Boolean(spaceId) &&
    (PRIMARY_NAV_SPACES as readonly string[]).includes(spaceId as string);
  const inConnector = spaceId === "connectors" && Boolean(connectorId);
  const isWorkItemBrowser = isWorkItemBrowserProjectId(projectId);
  const entityOpen =
    (Boolean(projectId) && !isWorkItemBrowser) || inConnector;
  const showEntityBack =
    entityOpen && !inChromeSub && !onMenuMain && mobileSurface !== "menu";
  const showProjectTools =
    !inChromeSub &&
    !onMenuMain &&
    Boolean(projectId) &&
    inPrimarySpace &&
    !isWorkItemBrowser;
  const showHomeChatPanelToggle =
    !inChromeSub &&
    !onMenuMain &&
    view === "chat" &&
    !spaceId &&
    !projectId;
  const showWorkItemToggle = isWorkItemBrowser && spaceId === "work";
  // Space-level Chat|{Space} toggle — not used inside a build/explore project chrome.
  const showSpaceToggle =
    !inChromeSub &&
    !onMenuMain &&
    !showProjectTools &&
    (showWorkItemToggle ||
      (!isDashboardOnlySpace(spaceId) &&
        (((inPrimarySpace || inConnector) &&
          (view === "space" || (view === "chat" && Boolean(spaceId)))) ||
          showHomeChatPanelToggle)));

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
  const panelTabLabel = showHomeChatPanelToggle
    ? "Panel"
    : inConnector
      ? "Connector"
      : spaceLabel;
  const headerBg =
    view === "space" && mobileSurface === "panel"
      ? SPACE_CANVAS_BG
      : MOBILE_APP_BG;
  const surface: MobileSurface =
    mobileSurface === "menu"
      ? "menu"
      : mobileSurface === "panel"
        ? "panel"
        : "chat";

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
  const onNewChatScreen =
    !inChromeSub &&
    !onMenuMain &&
    isNewChatScreen({
      view,
      threadId,
      thread,
      spaceId,
      projectId,
      drafting,
    });

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

  const handlePanelCompose = () => {
    if (spaceId === "studio" || spaceId === "build") {
      setNewProjectOpen(true);
      return;
    }
    if (spaceId === "research") {
      setNewProjectOpen(true);
      return;
    }
    startPanelNewChat();
  };

  const preview = previewAddress(project?.name);
  const address = liveUrl ?? previewUrlForProject(projectId ?? "project") ?? preview.url;
  const published = Boolean(
    entityProject?.publishedUrl ||
      (liveUrl && !liveUrl.includes("localhost")),
  );
  const canRename =
    spaceId === "build" || spaceId === "research" || spaceId === "studio";
  const projectTitle =
    findWorkCollectionItem(projectId)?.title ?? project?.name ?? "Project";

  useEffect(() => {
    if (!renameOpen) return;
    setRenameValue(projectTitle);
    setRenameError(null);
  }, [renameOpen, projectTitle]);

  const saveProjectName = async () => {
    if (!projectId || !canRename) return;
    const next = normalizeProjectTitle(renameValue);
    if (!next) {
      setRenameError("Project name is required.");
      return;
    }
    if (next === projectTitle) {
      setRenameError(null);
      setRenameOpen(false);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await updateProject(ctx, projectId, { title: next });
      setRenameOpen(false);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename project.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const onLeadingClick = () => {
    // In-project panel: left arrow returns to chat (does not leave the project).
    if (showProjectTools && surface === "panel") {
      setMobileSurface("chat");
      return;
    }
    // In-project chat: leave project → space screen.
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
      setMobileSurface(mobileContentSurface);
      return;
    }
    setMobileSurface("menu");
  };

  const setChatOrPanel = (next: "chat" | "panel") => {
    if (next === "panel") {
      dismissNativeKeyboard();
      setPanelMode("split");
      setMobileSurface("panel");
      return;
    }
    dismissNativeKeyboard();
    if (projectId) {
      setMobileSurface("chat");
      return;
    }
    if (!showSpaceToggle) return;
    if (spaceId && isDockChatSpace(spaceId)) {
      openSpaceChat(spaceId, {
        keepProject: Boolean(projectId),
        landOnPanel: false,
      });
      return;
    }
    setMobileSurface("chat");
  };

  const stopSwipe: TouchEventHandler = (event) => {
    event.stopPropagation();
  };

  const centerChrome =
    !onMenuMain &&
    (inChromeSub || showProjectTools || showSpaceToggle) ? (
      inChromeSub ? (
        <p className="truncate text-center text-[15px] font-medium tracking-[-0.01em]">
          {subTitle}
        </p>
      ) : showProjectTools ? (
        <div
          className="inline-flex h-11 max-w-[15rem] items-center justify-center rounded-full bg-muted/70 px-5 text-[14px] font-medium tracking-[-0.01em] text-foreground"
          aria-label={projectTitle}
        >
          <span className="truncate">{projectTitle}</span>
        </div>
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

  const projectPanelLabel =
    spaceId === "research" ||
    spaceId === "studio" ||
    spaceId === "build" ||
    spaceId === "home"
      ? "Canvas"
      : spaceId === "work"
        ? "Work"
        : "Canvas";

  return (
    <>
      <header
        data-no-swipe=""
        onTouchStart={stopSwipe}
        onTouchEnd={stopSwipe}
        className={cn(
          "shrink-0",
          headerBg,
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
            {showProjectTools && surface === "panel" ? (
              <button
                type="button"
                aria-label="Back to chat"
                onClick={onLeadingClick}
                className="inline-flex h-11 shrink-0 items-center gap-0.5 rounded-full bg-[var(--mobile-chrome-surface)] pl-2.5 pr-3.5 text-[14px] font-medium tracking-[-0.01em] text-foreground transition-colors duration-200 hover:bg-muted"
              >
                <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span>Chat</span>
              </button>
            ) : (
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
            )}
          </div>

          <div className="relative z-0 flex min-w-0 max-w-full justify-center justify-self-center px-2">
            {centerChrome}
          </div>

          <div className="relative z-10 flex items-center justify-self-end gap-0.5">
            {showProjectTools ? (
              surface === "chat" ? (
                <button
                  type="button"
                  aria-label={`Open ${projectPanelLabel}`}
                  onClick={() => setChatOrPanel("panel")}
                  className="inline-flex h-11 shrink-0 items-center gap-0.5 rounded-full bg-[var(--mobile-chrome-surface)] pl-3.5 pr-2.5 text-[14px] font-medium tracking-[-0.01em] text-foreground transition-colors duration-200 hover:bg-muted"
                >
                  <span>{projectPanelLabel}</span>
                  <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Project tools"
                  onClick={() => setActionsOpen(true)}
                  className={mobileChromeButtonClass}
                >
                  <Ellipsis className="h-5 w-5" strokeWidth={1.8} />
                </button>
              )
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
                onCompose={handlePanelCompose}
              />
            ) : hideNewChat || onNewChatScreen ? (
              <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
            ) : (
              <button
                type="button"
                aria-label="New"
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
          key={actionsOpen ? "open" : "closed"}
          published={published}
          selectMode={selectMode}
          canRename={canRename}
          onRename={() => {
            setActionsOpen(false);
            setRenameOpen(true);
          }}
          onOpenExternal={() => {
            openInAppBrowser(address);
            setActionsOpen(false);
          }}
          onSelectElement={() => {
            setSelectMode(!selectMode);
            setPanelMode("split");
            setMobileSurface("panel");
            setActionsOpen(false);
          }}
        />
      </MobileBottomSheet>

      <MobileBottomSheet
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        mode="rename"
      >
        <ProjectRenameSheetBody
          value={renameValue}
          error={renameError}
          busy={renameBusy}
          onChange={setRenameValue}
          onCancel={() => setRenameOpen(false)}
          onSave={() => void saveProjectName()}
        />
      </MobileBottomSheet>

      <MobileBottomSheet
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        mode="space"
      >
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-1">
          <p className="px-1 text-[17px] font-medium tracking-[-0.02em]">
            New project
          </p>
          <p className="mt-1 px-1 text-[13px] text-muted-foreground">
            Choose what to create on Canvas.
          </p>
          <div className="mt-4 space-y-0.5">
            {canvasStartOptions().map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={newProjectBusy}
                onClick={() => {
                  setNewProjectOpen(false);
                  if (item.action === "quick-search") {
                    openQuickSearchBrowser();
                    return;
                  }
                  if (!item.space || !item.kind || !item.title) return;
                  openCreate({
                    space: item.space,
                    kind: item.kind,
                    defaultTitle: item.title,
                    summary: item.summary,
                  });
                }}
                className="flex w-full flex-col rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-muted/70 disabled:opacity-60"
              >
                <span className="text-[15px] font-medium tracking-[-0.01em]">
                  {item.label}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {item.summary}
                </span>
              </button>
            ))}
          </div>
        </div>
      </MobileBottomSheet>

      {createProjectModal}
    </>
  );
}
