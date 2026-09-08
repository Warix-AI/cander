"use client";

import { useEffect, useState, useSyncExternalStore, type TouchEventHandler } from "react";
import { Blocks, ChevronLeft, Ellipsis, ExternalLink, Globe, Hammer, Image as ImageIcon, PanelsTopLeft, Plus, Search, Share, SquarePen, Trash2 } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  MobileBottomSheet,
  MobileHeaderActionsPopover,
  ProjectActionsSheetBody,
  ProjectMediaActionsSheetBody,
  ProjectRenameSheetBody,
} from "@/components/browser/ProjectMobileSheets";
import { getNativeCapabilities } from "@/lib/native";
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
  resolveNavSpaceId,
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
  MOBILE_GLASS_SEGMENT,
  MOBILE_GLASS_SEGMENT_ACTIVE,
  mobileChromeButtonClass,
} from "@/lib/mobile-menu-styles";
import type { MobileSurface, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

type MediaProjectActions = {
  onDownload: () => void;
  onReplace: () => void;
  onRemove: () => void;
  disabled?: boolean;
};

type ResearchBrowserActions = {
  address: string;
  onCopyLink: () => void;
  onOpenNewTab: () => void;
  onOpenSystemBrowser: () => void;
  onClearPage: () => void;
};

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
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const headerMenuOpen = actionsOpen || panelMenuOpen;
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [mediaProjectActions, setMediaProjectActions] =
    useState<MediaProjectActions | null>(null);
  const [researchBrowserActions, setResearchBrowserActions] =
    useState<ResearchBrowserActions | null>(null);
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

  // research/build fold under Canvas in nav — resolve so leave-project chrome matches menu.
  const navSpaceId = resolveNavSpaceId(spaceId) ?? spaceId;
  const inPrimarySpace =
    Boolean(navSpaceId) &&
    (PRIMARY_NAV_SPACES as readonly string[]).includes(navSpaceId as string);
  const inConnector = spaceId === "connectors" && Boolean(connectorId);
  const inConnectorsSpace = spaceId === "connectors";
  const isWorkItemBrowser = isWorkItemBrowserProjectId(projectId);
  const entityOpen =
    (Boolean(projectId) && !isWorkItemBrowser) || inConnector;
  const showEntityBack =
    Boolean(projectId) &&
    !isWorkItemBrowser &&
    !inChromeSub &&
    !onMenuMain &&
    mobileSurface !== "menu";
  const inCanvasProject =
    Boolean(projectId) &&
    !isWorkItemBrowser &&
    (inPrimarySpace || spaceId === "research" || spaceId === "build");
  const showProjectTools =
    !inChromeSub &&
    !onMenuMain &&
    inCanvasProject;
  const showHomeChatPanelToggle =
    !inChromeSub &&
    !onMenuMain &&
    view === "chat" &&
    !spaceId &&
    !projectId;
  const showWorkItemToggle = isWorkItemBrowser && spaceId === "work";
  // Space-level Chat|{Space} toggle — includes Connectors catalog (General →
  // Connectors) so users can switch Chat|Connectors instead of only swiping
  // into the wrong surface.
  const showSpaceToggle =
    !inChromeSub &&
    !onMenuMain &&
    !showProjectTools &&
    (showWorkItemToggle ||
      inConnector ||
      (inConnectorsSpace &&
        (view === "space" || (view === "chat" && Boolean(spaceId)))) ||
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
      : mobileMenuScreen === "workspace" ||
          mobileMenuScreen === "workspace-general"
        ? "Workspace"
        : mobileMenuScreen === "general"
          ? "General"
          : "";

  const spaceLabel = navSpaceId
    ? navLabel(navSpaceId as SpaceId) ?? "Space"
    : "Space";
  const panelTabLabel = showHomeChatPanelToggle ? "Panel" : spaceLabel;
  const surface: MobileSurface =
    mobileSurface === "menu"
      ? "menu"
      : mobileSurface === "panel"
        ? "panel"
        : "chat";
  const headerBg = "bg-transparent";

  const showCreateWorkspace =
    inSettings &&
    !settingsMobileHub &&
    settingsTab === "workspaces" &&
    !settingsWorkspaceId &&
    (entitlements.canCreatePersonalWorkspace ||
      entitlements.canCreateBusinessWorkspace);

  const panelActionsCtx = useMobilePanelActionsState();
  const panelActions = panelActionsCtx?.actions;

  useEffect(() => {
    const onMediaActions = (event: Event) => {
      setMediaProjectActions(
        (event as CustomEvent<MediaProjectActions | null>).detail,
      );
    };
    const onResearchActions = (event: Event) => {
      setResearchBrowserActions(
        (event as CustomEvent<ResearchBrowserActions | null>).detail,
      );
    };
    window.addEventListener("mobile-project-media-actions", onMediaActions);
    window.addEventListener(
      "mobile-research-browser-actions",
      onResearchActions,
    );
    return () => {
      window.removeEventListener("mobile-project-media-actions", onMediaActions);
      window.removeEventListener(
        "mobile-research-browser-actions",
        onResearchActions,
      );
    };
  }, []);
  const showPanelActions = Boolean(
    panelActions &&
      !onMenuMain &&
      !inChromeSub &&
      !showProjectTools &&
      !showCreateWorkspace &&
      // Connector ⋯ only on the panel — opening it from chat freezes the shell.
      ((inConnector && mobileSurface === "panel") ||
        view === "recents" ||
        (view === "space" &&
          mobileSurface === "panel" &&
          (!entityOpen || inConnector))),
  );
  useEffect(() => {
    if (!showPanelActions) setPanelMenuOpen(false);
  }, [showPanelActions]);

  const connectorBack = showPanelActions ? panelActions?.connector?.back : undefined;

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

  // Catalog connector detail uses chrome back + ⋯ (not New).
  const hideNewChat =
    onMenuMain ||
    inChromeSub ||
    showProjectTools ||
    showCreateWorkspace ||
    (inConnector && mobileSurface === "panel") ||
    Boolean(panelActions?.connector?.back);
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
    if (connectorBack) {
      connectorBack.onClick();
      return;
    }
    // Project back always returns to the Canvas project list.
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
      try {
        getNativeCapabilities().haptics.impact("navigation");
      } catch {
        /* never block */
      }
      return;
    }
    dismissNativeKeyboard();
    setMobileSurface("menu");
    try {
      getNativeCapabilities().haptics.impact("navigation");
    } catch {
      /* never block */
    }
  };

  const setChatOrPanel = (next: "chat" | "panel") => {
    if (next === "panel") {
      dismissNativeKeyboard();
      setPanelMode("split");
      setMobileSurface("panel");
      try {
        getNativeCapabilities().haptics.impact("navigation");
      } catch {
        /* never block */
      }
      return;
    }
    if (projectId) {
      setMobileSurface("chat");
      try {
        getNativeCapabilities().haptics.impact("navigation");
      } catch {
        /* never block */
      }
      return;
    }
    if (!showSpaceToggle) return;
    if (spaceId && isDockChatSpace(spaceId)) {
      openSpaceChat(spaceId, {
        keepProject: Boolean(projectId),
        landOnPanel: false,
      });
      try {
        getNativeCapabilities().haptics.impact("navigation");
      } catch {
        /* never block */
      }
      return;
    }
    setMobileSurface("chat");
    try {
      getNativeCapabilities().haptics.impact("navigation");
    } catch {
      /* never block */
    }
  };

  const stopSwipe: TouchEventHandler = (event) => {
    event.stopPropagation();
  };

  const openProjectActions = () => {
    setActionsOpen(true);
    try {
      getNativeCapabilities().haptics.impact("select");
    } catch {
      /* never block */
    }
  };

  const centerChrome =
    !headerMenuOpen &&
    !onMenuMain &&
    (inChromeSub || showProjectTools || showSpaceToggle) ? (
      inChromeSub ? (
        <p className="truncate text-center text-[15px] font-medium tracking-[-0.01em]">
          {subTitle}
        </p>
      ) : showProjectTools ? (
        <div
          role="tablist"
          aria-label={`${projectTitle} view`}
          className={cn("inline-flex max-w-full items-center rounded-full p-1", MOBILE_GLASS_SEGMENT)}
        >
          <button
            type="button"
            role="tab"
            aria-selected={surface === "chat"}
            onClick={() => setChatOrPanel("chat")}
            className={cn(
              "rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
              surface === "chat"
                ? MOBILE_GLASS_SEGMENT_ACTIVE
                : "text-muted-foreground",
            )}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={surface === "panel"}
            aria-label={
              mediaProjectActions
                ? "Image preview"
                : spaceId === "research"
                  ? "Search project"
                  : spaceId === "build"
                    ? "Build project"
                    : "Project preview"
            }
            onClick={() => setChatOrPanel("panel")}
            className={cn(
              "inline-flex min-w-11 items-center justify-center rounded-full px-3 py-2 transition-colors",
              surface === "panel"
                ? MOBILE_GLASS_SEGMENT_ACTIVE
                : "text-muted-foreground",
            )}
          >
            {mediaProjectActions ? (
              <ImageIcon className="h-4 w-4" strokeWidth={1.8} />
            ) : spaceId === "research" ? (
              <Search className="h-4 w-4" strokeWidth={1.8} />
            ) : spaceId === "build" ? (
              <Hammer className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <PanelsTopLeft className="h-4 w-4" strokeWidth={1.8} />
            )}
          </button>
        </div>
      ) : showSpaceToggle ? (
        <div
          role="tablist"
          aria-label="Surface"
          className={cn("inline-flex max-w-full items-center rounded-full p-1", MOBILE_GLASS_SEGMENT)}
        >
          <button
            type="button"
            role="tab"
            aria-selected={surface === "chat"}
            onClick={() => setChatOrPanel("chat")}
            className={cn(
              "rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
              surface === "chat"
                ? MOBILE_GLASS_SEGMENT_ACTIVE
                : "text-muted-foreground",
            )}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={surface === "panel"}
            aria-label={
              inConnector
                ? "Connector panel"
                : inConnectorsSpace
                  ? "Connectors"
                  : panelTabLabel
            }
            onClick={() => setChatOrPanel("panel")}
            className={cn(
              "inline-flex min-w-11 items-center justify-center rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
              surface === "panel"
                ? MOBILE_GLASS_SEGMENT_ACTIVE
                : "text-muted-foreground",
            )}
          >
            {inConnector && connectorId ? (
              <ConnectorMark
                id={connectorId}
                size="nav"
                className="!h-4 !w-4"
              />
            ) : inConnectorsSpace ? (
              <Blocks className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <span className="max-w-[9rem] truncate">{panelTabLabel}</span>
            )}
          </button>
        </div>
      ) : null
    ) : null;

  return (
    <>
      <header
        data-no-swipe=""
        style={{ backgroundColor: "transparent" }}
        onTouchStart={stopSwipe}
        onTouchEnd={stopSwipe}
        className={cn(
          "absolute inset-x-0 top-0 z-30 shrink-0",
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
            <button
              type="button"
              aria-label={
                connectorBack ? connectorBack.label : showEntityBack
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
              {connectorBack || showEntityBack || inChromeSub ? (
                <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
              ) : (
                <TwoLineMenuIcon />
              )}
            </button>
          </div>

          <div className="relative z-0 flex min-w-0 max-w-full justify-center justify-self-center px-2">
            {centerChrome}
          </div>

          <div className="relative z-10 flex items-center justify-self-end gap-0.5">
            {showProjectTools ? (
              actionsOpen ? (
                <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
              ) : (
                <button
                  type="button"
                  aria-label="Project tools"
                  onClick={openProjectActions}
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
                onOpenChange={setPanelMenuOpen}
              />
            ) : hideNewChat ? (
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

      <MobileHeaderActionsPopover
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
      >
        {mediaProjectActions ? (
          <ProjectMediaActionsSheetBody
            compact
            onDownload={() => {
              mediaProjectActions.onDownload();
              setActionsOpen(false);
            }}
            onReplace={() => {
              mediaProjectActions.onReplace();
              setActionsOpen(false);
            }}
            onRemove={() => {
              mediaProjectActions.onRemove();
              setActionsOpen(false);
            }}
            disabled={mediaProjectActions.disabled}
          />
        ) : researchBrowserActions ? (
          <div className="flex flex-col py-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                researchBrowserActions.onCopyLink();
                setActionsOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[15px] tracking-[-0.01em] hover:bg-black/[0.04] dark:hover:bg-white/[0.08]"
            >
              <Share className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate">Copy page link</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                researchBrowserActions.onOpenNewTab();
                setActionsOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[15px] tracking-[-0.01em] hover:bg-black/[0.04] dark:hover:bg-white/[0.08]"
            >
              <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate">Open in new tab</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={researchBrowserActions.address === "about:blank"}
              onClick={() => {
                researchBrowserActions.onOpenSystemBrowser();
                setActionsOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[15px] tracking-[-0.01em] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] disabled:opacity-40"
            >
              <Globe className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate">Open in Safari</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={researchBrowserActions.address === "about:blank"}
              onClick={() => {
                researchBrowserActions.onClearPage();
                setActionsOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[15px] tracking-[-0.01em] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate">Clear page</span>
            </button>
          </div>
        ) : (
          <div className="px-1 pb-1 pt-0.5">
            <ProjectActionsSheetBody
              key={actionsOpen ? "open" : "closed"}
              compact
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
          </div>
        )}
      </MobileHeaderActionsPopover>

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

function TwoLineMenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 8h16M4 16h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.1"
      />
    </svg>
  );
}
