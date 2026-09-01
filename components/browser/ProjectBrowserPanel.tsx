"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import {
  AppWindow,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Globe,
  LayoutTemplate,
  Maximize2,
  MessageSquare,
  Minimize2,
  MousePointer2,
  Pencil,
  Plus,
  RotateCw,
  Upload,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { BrowserSurfaceHost } from "@/components/browser/BrowserSurfaceHost";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import { BrowserAddressField } from "@/components/browser/BrowserAddressField";
import { BrowserChromeTooltip } from "@/components/browser/BrowserChromeTooltip";
import { FaviconImage } from "@/components/browser/FaviconImage";
import { getBrowserSurfaceAdapter, usesNativeBrowserSurface } from "@/lib/browser-surface";
import { MOBILE_PAGER_MS } from "@/lib/mobile-menu-styles";
import {
  MobileBottomSheet,
  ProjectAddSheetHeader,
  ProjectRenameSheetBody,
} from "@/components/browser/ProjectMobileSheets";
import { AppViewport } from "@/components/preview/AppViewport";
import { ComputerBrowserViewport } from "@/components/browser/ComputerBrowserViewport";
import {
  getActiveComputerSessionSnapshot,
  setActiveComputerControlMode,
  subscribeActiveComputerSession,
} from "@/lib/computer/active-session";
import {
  setActiveBrowserContextTab,
  subscribeBrowserContextReading,
  isBrowserContextReading,
} from "@/lib/browser-context";
import { hasDesktopBrowserBridge, isDesktopShell } from "@/lib/desktop-shell";
import { isCapacitorNative } from "@/lib/composer-attach";
import { NavToggle } from "@/components/shell/NavToggle";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { Dropdown } from "@/components/ui/Controls";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { normalizeProjectTitle } from "@/lib/project-name";
import {
  getSpaceEntityStoreServerSnapshot,
  getSpaceEntityStoreSnapshot,
  subscribeSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import {
  defaultProjectBrowserSession,
  focusAgentBrowserTab,
  getProjectBrowserSession,
  getProjectBrowserSessionRevision,
  isPreviewTabKind,
  makeProjectPreviewTab,
  makeWebTab,
  navigateProjectBrowserTab,
  setProjectBrowserSession,
  stepProjectBrowserTab,
  subscribeProjectBrowserSession,
  type ProjectBrowserKey,
  type ProjectBrowserSession,
  type ProjectBrowserTab,
} from "@/lib/project-browser-session";
import {
  isGoogleUrl,
  isHttpUrl,
  normalizeBrowserUrl,
  previewUrlForProject,
  displayHostFromUrl,
} from "@/lib/preview-url";
import type { ProjectKind, SpaceProject } from "@/lib/space-entities";
import { DESKTOP_NO_DRAG, useDesktopShell } from "@/lib/desktop-shell";
import {
  getSidebarPeeking,
  getSidebarPeekingServerSnapshot,
  subscribeSidebarPeeking,
} from "@/lib/sidebar-peek";
import { isDockChatSpace } from "@/lib/spaces";
import { useMobileShell } from "@/lib/use-media-query";
import { useProjectCoverCapture } from "@/lib/hooks/use-project-cover-capture";
import {
  defaultStandaloneBrowserSession,
  getStandaloneBrowserSession,
  setStandaloneBrowserSession,
  standaloneBrowserKey,
  STANDALONE_BROWSER_PROJECT_ID,
} from "@/lib/standalone-browser-session";
import {
  defaultWorkItemBrowserSession,
  findWorkCollectionItem,
  isWorkItemBrowserProjectId,
} from "@/lib/work-item-browser";
import { cn } from "@/lib/utils";

export function ProjectBrowserPanel({
  mode = "project",
}: {
  mode?: "project" | "standalone";
}) {
  const standalone = mode === "standalone";
  const {
    projectId,
    spaceId,
    project,
    actor,
    workspaceId,
    backToSpaceHome,
    drafting,
    thread,
    sidebarOpen,
    openSpaceChat,
    expandedLayout,
    toggleExpandedLayout,
    panelMode,
    openOverlay,
    selectMode,
    setSelectMode,
    refreshPreview,
    liveUrl,
    mobileSurface,
    closeStandaloneBrowser,
  } = useApp();
  const mobile = useMobileShell();
  const desktop = useDesktopShell();
  const [mobileSheet, setMobileSheet] = useState<"add" | "rename" | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [desktopRenameOpen, setDesktopRenameOpen] = useState(false);
  const { updateProject } = useSpaceMutation();
  const { ctx } = useSpaceData();
  const peeking = useSyncExternalStore(
    subscribeSidebarPeeking,
    getSidebarPeeking,
    getSidebarPeekingServerSnapshot,
  );
  const chatArmed = drafting || Boolean(thread);
  const projectFullscreen = !standalone && Boolean(projectId) && !chatArmed;
  const showHeaderNav = projectFullscreen && !sidebarOpen && !peeking;
  const entityRevision = useSyncExternalStore(
    subscribeSpaceEntityStore,
    () => getSpaceEntityStoreSnapshot().revision,
    () => getSpaceEntityStoreServerSnapshot().revision,
  );
  const sessionRevision = useSyncExternalStore(
    subscribeProjectBrowserSession,
    getProjectBrowserSessionRevision,
    getProjectBrowserSessionRevision,
  );

  const key: ProjectBrowserKey | null = standalone
    ? standaloneBrowserKey(actor.id, workspaceId)
    : projectId && spaceId && spaceId !== "connectors"
      ? {
          profileId: actor.id,
          workspaceId,
          spaceId,
          projectId,
        }
      : null;

  const entity = useMemo(() => {
    if (standalone || !projectId) return null;
    return (
      getSpaceEntityStoreSnapshot().projects.find(
        (item) => item.id === projectId && item.workspaceId === workspaceId,
      ) ?? null
    );
  }, [standalone, projectId, workspaceId, entityRevision]);

  const fallback = useMemo(() => {
    if (standalone) return defaultStandaloneBrowserSession();
    if (!projectId) {
      return defaultProjectBrowserSession({
        projectId: "project",
        title: "Project",
        spaceId: spaceId === "connectors" ? "build" : (spaceId ?? "build"),
      });
    }
    const workItem = findWorkCollectionItem(projectId);
    if (workItem) {
      return defaultWorkItemBrowserSession(workItem);
    }
    return defaultProjectBrowserSession({
      projectId,
      title: project?.name ?? entity?.title ?? "Project",
      publishedUrl: entity?.publishedUrl,
      spaceId: spaceId === "connectors" ? "build" : (spaceId ?? "build"),
    });
  }, [standalone, projectId, project?.name, entity?.title, entity?.publishedUrl, spaceId]);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const session =
    hydrated && key
      ? standalone
        ? getStandaloneBrowserSession(key, fallback)
        : getProjectBrowserSession(key, fallback)
      : fallback;

  const active =
    session.tabs.find((tab) => tab.id === session.activeTabId) ?? session.tabs[0];
  const computerSession = useSyncExternalStore(
    subscribeActiveComputerSession,
    getActiveComputerSessionSnapshot,
    getActiveComputerSessionSnapshot,
  );
  const [urlDraft, setUrlDraft] = useState(active?.url ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const next =
      active?.kind === "agent-browser"
        ? (computerSession?.currentUrl ?? active.url)
        : (active?.url ?? "");
    setUrlDraft(next);
  }, [
    active?.id,
    active?.url,
    active?.kind,
    computerSession?.currentUrl,
    sessionRevision,
  ]);

  const allProjects = useMemo(
    () =>
      getSpaceEntityStoreSnapshot().projects.filter(
        (item) => item.workspaceId === workspaceId,
      ),
    [workspaceId, entityRevision],
  );

  if (!active || !key) return null;
  if (!standalone && !projectId) return null;

  const write = (next: ProjectBrowserSession) => {
    if (standalone) {
      setStandaloneBrowserSession(key, next);
      return;
    }
    setProjectBrowserSession(key, next);
  };

  const selectTab = (id: string) => {
    write({ ...session, activeTabId: id });
  };

  const closeTab = (id: string) => {
    const tab = session.tabs.find((item) => item.id === id);
    if (!tab || tab.pinned) return;
    const tabs = session.tabs.filter((item) => item.id !== id);
    const activeTabId =
      session.activeTabId === id
        ? (tabs[0]?.id ?? session.activeTabId)
        : session.activeTabId;
    write({ tabs, activeTabId });
  };

  const addUrlTab = (url?: string) => {
    const tab = makeWebTab();
    const next = url
      ? navigateProjectBrowserTab(tab, normalizeBrowserUrl(url))
      : tab;
    write({
      tabs: [...session.tabs, next],
      activeTabId: next.id,
    });
  };

  const addProjectTab = (item: SpaceProject) => {
    const existing = session.tabs.find(
      (tab) =>
        (tab.kind === "project-preview" || tab.kind === "build-preview") &&
        tab.projectId === item.id,
    );
    if (existing) {
      selectTab(existing.id);
      return;
    }
    const tab = makeProjectPreviewTab({
      projectId: item.id,
      title: item.title,
      url: previewUrlForProject(item.id, item.publishedUrl),
    });
    write({
      tabs: [...session.tabs, tab],
      activeTabId: tab.id,
    });
  };

  const commitUrl = () => {
    const url = normalizeBrowserUrl(urlDraft);
    write({
      ...session,
      tabs: session.tabs.map((tab) =>
        tab.id === active.id ? navigateProjectBrowserTab(tab, url) : tab,
      ),
    });
  };

  const goHistory = (delta: -1 | 1) => {
    write({
      ...session,
      tabs: session.tabs.map((tab) =>
        tab.id === active.id ? stepProjectBrowserTab(tab, delta) : tab,
      ),
    });
  };

  const runBrowserNav = (action: "back" | "forward" | "reload") => {
    const adapter = getBrowserSurfaceAdapter();
    if (adapter.id === "web-pwa") {
      if (action === "reload") {
        setReloadKey((value) => value + 1);
      } else {
        goHistory(action === "back" ? -1 : 1);
      }
      return;
    }
    if (action === "back") void adapter.back(active.id);
    else if (action === "forward") void adapter.forward(active.id);
    else void adapter.reload(active.id);
  };

  const canBack = active.historyIndex > 0;
  const canForward = active.historyIndex < active.history.length - 1;
  const extraProjects = allProjects.filter((item) => item.id !== projectId);
  const [panelRevealReady, setPanelRevealReady] = useState(
    !mobile || mobileSurface === "panel",
  );
  useEffect(() => {
    if (!mobile) {
      setPanelRevealReady(true);
      return;
    }
    if (mobileSurface !== "panel") {
      setPanelRevealReady(false);
      return;
    }
    setPanelRevealReady(false);
    const t = window.setTimeout(
      () => setPanelRevealReady(true),
      MOBILE_PAGER_MS + 20,
    );
    return () => window.clearTimeout(t);
  }, [mobile, mobileSurface]);
  // Native WKWebView / WebContentsView must hide when chat covers the panel.
  const surfaceActive =
    panelMode !== "collapsed" &&
    (!mobile || (mobileSurface === "panel" && panelRevealReady));
  const address =
    active.kind === "agent-browser"
      ? (computerSession?.currentUrl ?? active.url)
      : standalone
        ? (liveUrl ?? active.url)
        : (liveUrl ??
          active.url ??
          previewUrlForProject(projectId ?? "project", entity?.publishedUrl));
  const workItem = findWorkCollectionItem(projectId);
  const projectTitle =
    standalone
      ? "Browser"
      : (workItem?.title ??
        project?.name ??
        entity?.title ??
        active.title ??
        "Project");
  const previewFallbackName = workItem?.title ?? project?.name ?? "Project";
  const previewFallbackSummary = workItem?.summary ?? project?.summary ?? "";
  const canRename =
    !standalone &&
    !isWorkItemBrowserProjectId(projectId) &&
    (spaceId === "build" || spaceId === "research");
  /** Work space items hide URL/nav chrome until the user adds a browser tab. */
  const isWorkItemBrowser =
    !standalone && spaceId === "work" && isWorkItemBrowserProjectId(projectId);
  const showBrowserNavChrome =
    !isWorkItemBrowser || session.tabs.some((tab) => tab.kind === "web");

  // Selected tab only — chat browser-context tools read this pointer.
  // Keep it while chat is open (mobile) so the user can ask about the page
  // they just left; native views remain registered even when hidden.
  useEffect(() => {
    if (!active) {
      setActiveBrowserContextTab(null);
      return;
    }
    const url =
      active.kind === "agent-browser"
        ? (computerSession?.currentUrl ?? active.url)
        : address;
    const canNative =
      (typeof window !== "undefined" &&
        isDesktopShell() &&
        hasDesktopBrowserBridge()) ||
      (typeof window !== "undefined" && isCapacitorNative());
    setActiveBrowserContextTab({
      tabId: active.id,
      tabKind: active.kind,
      title: active.title,
      url: url || active.url,
      projectId: active.projectId ?? projectId ?? undefined,
      sessionId: active.computerSessionId ?? computerSession?.sessionId,
      canReadText: true,
      canCaptureViewport: active.kind === "agent-browser" ? false : canNative,
    });
  }, [
    active?.id,
    active?.kind,
    active?.title,
    active?.url,
    active?.projectId,
    active?.computerSessionId,
    address,
    projectId,
    computerSession?.currentUrl,
    computerSession?.sessionId,
  ]);

  useEffect(() => {
    return () => {
      setActiveBrowserContextTab(null);
    };
  }, []);

  const readingPage = useSyncExternalStore(
    subscribeBrowserContextReading,
    isBrowserContextReading,
    () => false,
  );

  useEffect(() => {
    setRenameValue(projectTitle);
    setRenameError(null);
  }, [projectTitle, projectId, mobileSheet, desktopRenameOpen]);

  // Keep browser tab labels in sync with the saved project name.
  useEffect(() => {
    if (standalone || !key || !projectId || !projectTitle) return;
    const current = getProjectBrowserSession(key, fallback);
    const needsSync = current.tabs.some(
      (tab) =>
        isPreviewTabKind(tab.kind) &&
        tab.projectId === projectId &&
        tab.title !== projectTitle,
    );
    if (!needsSync) return;
    setProjectBrowserSession(key, {
      ...current,
      tabs: current.tabs.map((tab) =>
        isPreviewTabKind(tab.kind) && tab.projectId === projectId
          ? { ...tab, title: projectTitle }
          : tab,
      ),
    });
  }, [key, projectId, projectTitle, fallback, sessionRevision]);

  // Focus / create agent-browser tab only when the computer session requests focus.
  // Background research updates URL on an existing agent-browser tab without stealing the active tab.
  useEffect(() => {
    if (!key) return;
    let appliedFocusRevision = 0;
    const apply = () => {
      const computer = getActiveComputerSessionSnapshot();
      if (!computer?.sessionId) return;
      const current = getProjectBrowserSession(key, fallback);
      if (computer.focusRevision > appliedFocusRevision) {
        appliedFocusRevision = computer.focusRevision;
        setProjectBrowserSession(
          key,
          focusAgentBrowserTab(current, {
            url: computer.currentUrl ?? "about:blank",
            computerSessionId: computer.sessionId,
            title: "Agent browser",
          }),
        );
        return;
      }
      const existing = current.tabs.find(
        (tab) =>
          tab.kind === "agent-browser" &&
          tab.computerSessionId === computer.sessionId,
      );
      if (
        existing &&
        computer.currentUrl &&
        existing.url !== computer.currentUrl
      ) {
        setProjectBrowserSession(key, {
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.id === existing.id
              ? navigateProjectBrowserTab(tab, computer.currentUrl!)
              : tab,
          ),
        });
      }
    };
    const unsub = subscribeActiveComputerSession(apply);
    apply();
    return () => {
      unsub();
    };
  }, [key, fallback]);

  const saveProjectName = async () => {
    if (!projectId || !canRename) return;
    const next = normalizeProjectTitle(renameValue);
    if (!next) {
      setRenameError("Project name is required.");
      return;
    }
    if (next === projectTitle) {
      setRenameError(null);
      setDesktopRenameOpen(false);
      setMobileSheet(null);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await updateProject(ctx, projectId, { title: next });
      if (key) {
        const current = getProjectBrowserSession(key, fallback);
        setProjectBrowserSession(key, {
          ...current,
          tabs: current.tabs.map((tab) =>
            isPreviewTabKind(tab.kind) && tab.projectId === projectId
              ? { ...tab, title: next }
              : tab,
          ),
        });
      }
      setDesktopRenameOpen(false);
      setMobileSheet(null);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename project.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const openAddSheet = () => {
    setAddQuery("");
    setMobileSheet("add");
  };

  const submitAddQuery = () => {
    const q = addQuery.trim();
    if (!q) return;
    const matched = extraProjects.find(
      (item) => item.title.toLowerCase() === q.toLowerCase(),
    );
    if (matched) {
      addProjectTab(matched);
    } else {
      addUrlTab(q);
    }
    setMobileSheet(null);
    setAddQuery("");
  };

  const filteredExtra = addQuery.trim()
    ? extraProjects.filter((item) =>
        item.title.toLowerCase().includes(addQuery.trim().toLowerCase()),
      )
    : extraProjects;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-sidebar">
      {mobile ? null : standalone ? (
        <>
          <div
            className="flex h-11 min-w-0 shrink-0 items-center gap-1 bg-sidebar px-2"
            style={desktop ? DESKTOP_NO_DRAG : undefined}
          >
            <ProjectTabStrip
              tabs={session.tabs}
              activeId={active.id}
              projects={allProjects}
              onSelect={selectTab}
              onClose={closeTab}
              onAddUrl={() => addUrlTab()}
              onAddProject={addProjectTab}
              extraProjects={extraProjects}
              webOnly
            />
            {panelMode !== "collapsed" ? (
              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <BrowserChromeTooltip label="Close browser">
                  <button
                    type="button"
                    aria-label="Close browser"
                    onClick={() => closeStandaloneBrowser()}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </BrowserChromeTooltip>
                <PanelToggle />
              </span>
            ) : null}
          </div>
          <div className="relative flex h-10 min-w-0 shrink-0 items-center gap-0.5 border-t border-border bg-sidebar px-2">
            <div className="flex shrink-0 items-center gap-0.5">
              <RailBtn
                label="Back"
                disabled={!canBack}
                onClick={() => runBrowserNav("back")}
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
              </RailBtn>
              <RailBtn
                label="Forward"
                disabled={!canForward}
                onClick={() => runBrowserNav("forward")}
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
              </RailBtn>
              <RailBtn label="Reload" onClick={() => runBrowserNav("reload")}>
                <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
              </RailBtn>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[7.5rem]">
              <BrowserAddressField
                className="pointer-events-auto w-full"
                url={address}
                faviconUrl={active.faviconUrl}
                draft={urlDraft}
                onDraftChange={setUrlDraft}
                onCommit={commitUrl}
                showFavicon={false}
                placeholder="Search"
              />
            </div>
          </div>
        </>
      ) : (
        <div
          className={cn(
            "flex h-[45px] min-w-0 shrink-0 items-center gap-1 bg-sidebar",
            showHeaderNav
              ? "pr-2 pl-[max(0.5rem,var(--desktop-traffic-clear,0px))]"
              : "px-2",
          )}
          style={desktop ? DESKTOP_NO_DRAG : undefined}
        >
          {showHeaderNav ? <NavToggle /> : null}
          {showHeaderNav && spaceId && isDockChatSpace(spaceId) ? (
            <RailBtn
              label="Open chat"
              onClick={() => openSpaceChat(spaceId, { keepProject: true })}
            >
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.6} />
            </RailBtn>
          ) : null}
          <ProjectTabStrip
            tabs={session.tabs}
            activeId={active.id}
            projects={allProjects}
            onSelect={selectTab}
            onClose={closeTab}
            onAddUrl={() => addUrlTab()}
            onAddProject={addProjectTab}
            extraProjects={extraProjects}
          />
          {readingPage ? (
            <span
              className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground"
              title="Cander is reading the active page"
            >
              Reading page
            </span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {chatArmed ? (
              <BrowserChromeTooltip
                label={expandedLayout ? "Restore layout" : "Expand"}
              >
                <button
                  type="button"
                  aria-label={expandedLayout ? "Restore layout" : "Expand"}
                  onClick={() => toggleExpandedLayout()}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
                >
                  {expandedLayout ? (
                    <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  )}
                </button>
              </BrowserChromeTooltip>
            ) : null}
            {panelMode === "collapsed" ? null : standalone ? (
              <BrowserChromeTooltip label="Close browser">
                <button
                  type="button"
                  aria-label="Close browser"
                  onClick={() => closeStandaloneBrowser()}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </BrowserChromeTooltip>
            ) : (
              <BrowserChromeTooltip label="Leave project">
                <button
                  type="button"
                  aria-label="Leave project"
                  onClick={() => backToSpaceHome()}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </BrowserChromeTooltip>
            )}
            {chatArmed ? <PanelToggle /> : null}
          </span>
        </div>
      )}

      {mobile ? null : standalone ? null : showBrowserNavChrome ? (
        <div className="relative flex h-[45px] min-w-0 shrink-0 items-center gap-0.5 border-t border-border bg-sidebar px-2">
          <div className="flex shrink-0 items-center gap-0.5">
            <RailBtn
              label="Back"
              disabled={!canBack}
              onClick={() => runBrowserNav("back")}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
            </RailBtn>
            <RailBtn
              label="Forward"
              disabled={!canForward}
              onClick={() => runBrowserNav("forward")}
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
            </RailBtn>
            <RailBtn label="Reload" onClick={() => runBrowserNav("reload")}>
              <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
            </RailBtn>
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[7.5rem]">
            <BrowserAddressField
              className="pointer-events-auto w-full"
              url={address}
              faviconUrl={active.faviconUrl}
              draft={urlDraft}
              onDraftChange={setUrlDraft}
              onCommit={commitUrl}
              showFavicon={false}
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center">
            {standalone ? (
              <>
                <RailBtn
                  label="Open in new window"
                  onClick={() => window.open(address, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
                </RailBtn>
              </>
            ) : (
              <DesktopProjectToolsMenu
                selectMode={selectMode}
                canRename={canRename}
                onRename={() => setDesktopRenameOpen(true)}
                onPublish={() => openOverlay("publish")}
                onDomain={() => openOverlay("domains")}
                onOpenExternal={() => window.open(address, "_blank")}
                onSelectElement={() => setSelectMode(!selectMode)}
                onRefresh={() => {
                  refreshPreview();
                  runBrowserNav("reload");
                }}
              />
            )}
          </div>
        </div>
      ) : null}

      {desktopRenameOpen ? (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/20 pt-24">
          <div className="w-full max-w-sm rounded-[16px] border border-border bg-background p-4 shadow-lg">
            <p className="text-[14px] font-medium tracking-[-0.01em]">Rename project</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveProjectName();
                }
                if (event.key === "Escape") setDesktopRenameOpen(false);
              }}
              spellCheck={false}
              className="mt-3 h-10 w-full rounded-[12px] border border-border bg-muted/40 px-3 text-[14px] outline-none"
            />
            {renameError ? (
              <p className="mt-2 text-[12px] text-destructive">{renameError}</p>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                Must be unique across this workspace.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDesktopRenameOpen(false)}
                className="h-9 rounded-[10px] px-3 text-[13px] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={renameBusy}
                onClick={() => void saveProjectName()}
                className="h-9 rounded-[10px] bg-foreground px-3.5 text-[13px] font-medium text-background disabled:opacity-60"
              >
                {renameBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-white dark:bg-neutral-950">
        <div className="absolute inset-0 min-h-0">
          <ProjectBrowserBody
          tab={active}
          projects={allProjects}
          fallbackName={previewFallbackName}
          fallbackSummary={previewFallbackSummary}
          reloadKey={reloadKey}
          userId={actor.id}
          browserKey={key}
          surfaceActive={surfaceActive}
          />
        </div>
        {mobile && mobileNavOpen ? (
          <MobileBrowserNavSheet
            urlDraft={urlDraft}
            canBack={canBack}
            canForward={canForward}
            onUrlChange={setUrlDraft}
            onCommitUrl={commitUrl}
            onBack={() => runBrowserNav("back")}
            onForward={() => runBrowserNav("forward")}
            onReload={() => runBrowserNav("reload")}
            onClose={() => setMobileNavOpen(false)}
          />
        ) : null}
      </div>
      {mobile && showBrowserNavChrome ? (
        <button
          type="button"
          aria-label="Edit address"
          onClick={() => setMobileNavOpen(true)}
          className="relative z-10 flex shrink-0 items-center border-t border-border bg-sidebar px-3 py-2.5"
        >
          <span className="min-w-0 flex-1 truncate text-center font-mono text-[13px] text-muted-foreground">
            {displayHostFromUrl(address) || "Enter URL"}
          </span>
        </button>
      ) : null}
      {mobile ? (
        <ProjectMobileTabBar
          tabs={session.tabs}
          activeId={active.id}
          projects={allProjects}
          projectTitle={projectTitle}
          onSelect={selectTab}
          onClose={closeTab}
          onAdd={openAddSheet}
        />
      ) : null}

      <MobileBottomSheet
        open={mobile && mobileSheet === "rename"}
        onClose={() => setMobileSheet(null)}
        mode="rename"
      >
        <ProjectRenameSheetBody
          value={renameValue}
          error={renameError}
          busy={renameBusy}
          onChange={setRenameValue}
          onCancel={() => setMobileSheet(null)}
          onSave={() => void saveProjectName()}
        />
      </MobileBottomSheet>

      <MobileBottomSheet
        open={mobile && mobileSheet === "add"}
        onClose={() => setMobileSheet(null)}
        mode="add"
      >
        <ProjectAddSheetHeader
          query={addQuery}
          onQueryChange={setAddQuery}
          onSubmit={submitAddQuery}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-1">
          {!standalone ? (
            <>
              <p className="px-1 pb-2 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Projects
              </p>
              {filteredExtra.length ? (
                filteredExtra.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      addProjectTab(item);
                      setMobileSheet(null);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2.5 text-left text-[15px] hover:bg-muted/70"
                  >
                    <KindGlyph kind={item.kind} />
                    <span className="truncate">{item.title}</span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-3 text-[13px] text-muted-foreground">
                  No other projects to add. Enter a URL above to open a tab.
                </p>
              )}
            </>
          ) : (
            <p className="px-2 py-3 text-[13px] text-muted-foreground">
              Enter a URL above to open a tab.
            </p>
          )}
        </div>
      </MobileBottomSheet>
    </div>
  );
}

function ProjectBrowserBody({
  tab,
  projects,
  fallbackName,
  fallbackSummary,
  reloadKey,
  userId,
  browserKey,
  surfaceActive,
}: {
  tab: ProjectBrowserTab;
  projects: SpaceProject[];
  fallbackName: string;
  fallbackSummary: string;
  reloadKey: number;
  userId: string;
  browserKey: ProjectBrowserKey;
  surfaceActive: boolean;
}) {
  const computerSession = useSyncExternalStore(
    subscribeActiveComputerSession,
    getActiveComputerSessionSnapshot,
    getActiveComputerSessionSnapshot,
  );

  useProjectCoverCapture({
    tabId: tab.id,
    projectId: browserKey.projectId,
    tabKind: tab.kind,
    surfaceActive,
  });

  const syncSurfaceMeta = (patch: {
    url?: string;
    title?: string;
    faviconUrl?: string | null;
  }) => {
    const sessionFallback =
      browserKey.projectId === STANDALONE_BROWSER_PROJECT_ID
        ? defaultStandaloneBrowserSession()
        : (() => {
            const item = findWorkCollectionItem(browserKey.projectId);
            if (item) return defaultWorkItemBrowserSession(item);
            return defaultProjectBrowserSession({
              projectId: browserKey.projectId,
              title: fallbackName,
              spaceId: browserKey.spaceId,
            });
          })();
    const current = getProjectBrowserSession(browserKey, sessionFallback);
    const nextTabs = current.tabs.map((item) => {
      if (item.id !== tab.id) return item;
      let next = item;
      if (patch.url && patch.url !== item.url) {
        next = navigateProjectBrowserTab(next, patch.url, patch.title);
      } else if (patch.title && patch.title !== item.title) {
        next = { ...next, title: patch.title };
      }
      if (
        patch.faviconUrl !== undefined &&
        patch.faviconUrl !== item.faviconUrl
      ) {
        next = { ...next, faviconUrl: patch.faviconUrl };
      }
      return next;
    });
    if (nextTabs.some((item, i) => item !== current.tabs[i])) {
      const next = { ...current, tabs: nextTabs };
      if (browserKey.projectId === STANDALONE_BROWSER_PROJECT_ID) {
        setStandaloneBrowserSession(browserKey, next);
      } else {
        setProjectBrowserSession(browserKey, next);
      }
    }
  };

  // Agent-browser tabs always use the computer stream — never overload a web tab.
  if (tab.kind === "agent-browser") {
    const sessionId =
      tab.computerSessionId ?? computerSession?.sessionId ?? null;
    if (!sessionId) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Waiting for agent browser session…
        </div>
      );
    }
    return (
      <ComputerBrowserViewport
        sessionId={sessionId}
        controlMode={computerSession?.controlMode ?? "agent"}
        onTakeControl={() => setActiveComputerControlMode("user")}
        onGiveBack={() => setActiveComputerControlMode("agent")}
      />
    );
  }

  if (tab.kind === "web") {
    return (
      <div className="relative h-full min-h-0">
        <BrowserSurfaceHost
          tabId={tab.id}
          url={tab.url}
          reloadKey={reloadKey}
          title={tab.title}
          userId={userId}
          active={surfaceActive}
          onUrlChange={(nextUrl) => syncSurfaceMeta({ url: nextUrl })}
          onTitleChange={(nextTitle) => syncSurfaceMeta({ title: nextTitle })}
          onFaviconChange={(faviconUrl) => syncSurfaceMeta({ faviconUrl })}
        />
      </div>
    );
  }

  if (tab.kind === "build-preview" || tab.kind === "project-preview") {
    const match =
      projects.find((item) => item.id === tab.projectId) ?? null;
    const previewUrl =
      match?.publishedUrl && isHttpUrl(match.publishedUrl)
        ? match.publishedUrl
        : tab.url;
    if (previewUrl && isHttpUrl(previewUrl) && !isGoogleUrl(previewUrl)) {
      return (
        <div className="relative h-full min-h-0">
          <BrowserSurfaceHost
            tabId={tab.id}
            url={previewUrl}
            previewOnly
            isolatedPartition
            reloadKey={reloadKey}
            title={tab.title}
            userId={userId}
            projectId={tab.projectId ?? null}
            active={surfaceActive}
            onUrlChange={(nextUrl) => syncSurfaceMeta({ url: nextUrl })}
            onTitleChange={(nextTitle) => syncSurfaceMeta({ title: nextTitle })}
            onFaviconChange={(faviconUrl) => syncSurfaceMeta({ faviconUrl })}
          />
        </div>
      );
    }
    return (
      <AppViewport
        name={match?.title ?? fallbackName}
        summary={match?.summary ?? fallbackSummary}
      />
    );
  }

  if (isHttpUrl(tab.url) && tab.url !== "https://" && tab.url !== "http://") {
    return (
      <div className="relative h-full min-h-0">
        <BrowserSurfaceHost
          tabId={tab.id}
          url={tab.url}
          reloadKey={reloadKey}
          title={tab.title}
          userId={userId}
          active={surfaceActive}
          onUrlChange={(nextUrl) => syncSurfaceMeta({ url: nextUrl })}
          onTitleChange={(nextTitle) => syncSurfaceMeta({ title: nextTitle })}
          onFaviconChange={(faviconUrl) => syncSurfaceMeta({ faviconUrl })}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Enter a URL to browse
    </div>
  );
}

function ProjectTabStrip({
  tabs,
  activeId,
  projects,
  extraProjects,
  onSelect,
  onClose,
  onAddUrl,
  onAddProject,
  webOnly = false,
}: {
  tabs: ProjectBrowserTab[];
  activeId: string;
  projects: SpaceProject[];
  extraProjects: SpaceProject[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAddUrl: () => void;
  onAddProject: (project: SpaceProject) => void;
  webOnly?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      {tabs.map((tab) => (
        <ProjectTabButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
          project={projects.find((item) => item.id === tab.projectId)}
          onSelect={() => onSelect(tab.id)}
          onClose={() => onClose(tab.id)}
        />
      ))}
      {webOnly ? (
        <BrowserChromeTooltip label="New tab">
          <button
            type="button"
            aria-label="New tab"
            onClick={onAddUrl}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </BrowserChromeTooltip>
      ) : (
        <AddTabMenu
          extraProjects={extraProjects}
          onAddUrl={onAddUrl}
          onAddProject={onAddProject}
        />
      )}
    </div>
  );
}

function ProjectMobileTabBar({
  tabs,
  activeId,
  projects,
  projectTitle,
  onSelect,
  onClose,
  onAdd,
}: {
  tabs: ProjectBrowserTab[];
  activeId: string;
  projects: SpaceProject[];
  projectTitle: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}) {
  const labelFor = (tab: ProjectBrowserTab) => {
    if (!isPreviewTabKind(tab.kind)) return tab.title;
    if (tab.id === activeId && projectTitle) return projectTitle;
    const match = projects.find((item) => item.id === tab.projectId);
    return match?.title || tab.title;
  };

  return (
    <div className="relative z-10 flex shrink-0 items-center gap-1.5 overflow-hidden border-t border-border bg-sidebar px-2 py-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.375rem)]">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const label = labelFor(tab);
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (!active) onSelect(tab.id);
            }}
            className={cn(
              "inline-flex h-9 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] tracking-[-0.01em] transition-colors",
              active
                ? "bg-muted/70 text-foreground"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <TabGlyph tab={tab} className="h-3.5 w-3.5" />
            <span className="truncate">{label}</span>
            {tab.pinned ? null : (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Close ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose(tab.id);
                  }
                }}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2} />
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="New tab"
        title="New tab"
        onClick={onAdd}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors duration-200 hover:bg-muted"
      >
        <Plus className="h-4 w-4" strokeWidth={1.8} />
      </button>
    </div>
  );
}

function BrowserChromeDropdown(props: ComponentProps<typeof Dropdown>) {
  const [open, setOpen] = useState(false);
  const nativeSurface = usesNativeBrowserSurface();

  return (
    <>
      <NativeOverlayGate open={open && nativeSurface} />
      <Dropdown
        {...props}
        onOpenChange={(next) => {
          setOpen(next);
          props.onOpenChange?.(next);
        }}
      />
    </>
  );
}

function DesktopProjectToolsMenu({
  selectMode,
  canRename,
  onRename,
  onPublish,
  onDomain,
  onOpenExternal,
  onSelectElement,
  onRefresh,
}: {
  selectMode: boolean;
  canRename: boolean;
  onRename: () => void;
  onPublish: () => void;
  onDomain: () => void;
  onOpenExternal: () => void;
  onSelectElement: () => void;
  onRefresh: () => void;
}) {
  return (
    <BrowserChromeDropdown
      align="end"
      matchTrigger={false}
      menuClassName="min-w-[14rem] z-[320]"
      trigger={({ toggle }) => (
        <RailBtn label="Project tools" onClick={toggle}>
          <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
      )}
    >
      {(close) => (
        <>
          {canRename ? (
            <DesktopMenuItem
              icon={Pencil}
              onClick={() => {
                onRename();
                close();
              }}
            >
              Rename
            </DesktopMenuItem>
          ) : null}
          <DesktopMenuItem
            icon={Upload}
            onClick={() => {
              onPublish();
              close();
            }}
          >
            Publish
          </DesktopMenuItem>
          <DesktopMenuItem
            icon={Globe}
            onClick={() => {
              onDomain();
              close();
            }}
          >
            Domains
          </DesktopMenuItem>
          <DesktopMenuItem
            icon={ExternalLink}
            onClick={() => {
              onOpenExternal();
              close();
            }}
          >
            Open externally
          </DesktopMenuItem>
          <DesktopMenuItem
            icon={MousePointer2}
            active={selectMode}
            onClick={() => {
              onSelectElement();
              close();
            }}
          >
            Select element
          </DesktopMenuItem>
          <DesktopMenuItem
            icon={RotateCw}
            onClick={() => {
              onRefresh();
              close();
            }}
          >
            Refresh
          </DesktopMenuItem>
        </>
      )}
    </BrowserChromeDropdown>
  );
}

function DesktopMenuItem({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: string;
  active?: boolean;
  onClick: () => void;
  icon: typeof Upload;
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
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
      {children}
    </button>
  );
}

function MobileBrowserNavSheet({
  urlDraft,
  canBack,
  canForward,
  onUrlChange,
  onCommitUrl,
  onBack,
  onForward,
  onReload,
  onClose,
}: {
  urlDraft: string;
  canBack: boolean;
  canForward: boolean;
  onUrlChange: (value: string) => void;
  onCommitUrl: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss address bar"
        className="absolute inset-0 bg-black/25"
        onClick={onClose}
      />
      <div
        className="relative mx-3 rounded-[16px] border border-border bg-background p-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
        style={{
          marginBottom:
            "calc(env(safe-area-inset-bottom, 0px) + 0.75rem + var(--keyboard-inset, 0px))",
        }}
      >
        <div className="flex items-center gap-1">
          <RailBtn label="Back" disabled={!canBack} onClick={onBack}>
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <RailBtn label="Forward" disabled={!canForward} onClick={onForward}>
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <RailBtn label="Reload" onClick={onReload}>
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitUrl();
              onClose();
            }}
          >
            <input
              value={urlDraft}
              onChange={(event) => onUrlChange(event.target.value)}
              onBlur={onCommitUrl}
              spellCheck={false}
              autoFocus
              aria-label="Address"
              className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] text-foreground outline-none"
            />
          </form>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectTabButton({
  tab,
  active,
  project,
  onSelect,
  onClose,
}: {
  tab: ProjectBrowserTab;
  active: boolean;
  project?: SpaceProject;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group inline-flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] tracking-[-0.01em] transition-colors duration-200",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <TabGlyph tab={tab} kind={project?.kind} />
      <span
        className={cn(
          "truncate",
          !tab.title && tab.url === "about:blank" && "min-w-[2rem]",
        )}
      >
        {tab.title ||
          (tab.url !== "about:blank" ? tab.url : "")}
      </span>
      {tab.pinned ? null : (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Close ${tab.title || "tab"}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
        >
          <X className="h-2.5 w-2.5" strokeWidth={2} />
        </span>
      )}
    </button>
  );
}

function AddTabMenu({
  extraProjects,
  onAddUrl,
  onAddProject,
  compact = false,
}: {
  extraProjects: SpaceProject[];
  onAddUrl: () => void;
  onAddProject: (project: SpaceProject) => void;
  compact?: boolean;
}) {
  return (
    <BrowserChromeDropdown
      align="start"
      matchTrigger={false}
      menuClassName="min-w-[14rem] max-h-[min(20rem,50vh)] overflow-y-auto z-[320]"
      trigger={({ toggle }) => (
        <BrowserChromeTooltip label="New tab">
          <button
            type="button"
            aria-label="New tab"
            onClick={toggle}
            className={cn(
              "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground",
              compact ? "h-9 w-9 rounded-full" : "h-7 w-7 rounded-lg",
            )}
          >
            <Plus className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.8} />
          </button>
        </BrowserChromeTooltip>
      )}
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAddUrl();
              close();
            }}
            className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted"
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
            New browser tab
          </button>
          {extraProjects.length ? (
            <>
              <p className="px-2.5 pt-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                Other projects
              </p>
              {extraProjects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAddProject(item);
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted"
                >
                  <KindGlyph kind={item.kind} />
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </>
          ) : null}
        </>
      )}
    </BrowserChromeDropdown>
  );
}

function TabGlyph({
  tab,
  kind,
  className,
}: {
  tab: ProjectBrowserTab;
  kind?: ProjectKind;
  className?: string;
}) {
  if (tab.kind === "agent-browser") {
    return <MousePointer2 className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={1.6} />;
  }
  if (tab.kind === "web" || isHttpUrl(tab.url)) {
    return (
      <FaviconImage
        url={tab.url}
        faviconUrl={tab.faviconUrl}
        className={className}
        size={14}
      />
    );
  }
  return <KindGlyph kind={kind} className={className} />;
}

function KindGlyph({ kind, className }: { kind?: ProjectKind; className?: string }) {
  const cls = cn("h-3.5 w-3.5 shrink-0", className);
  if (kind === "site") return <LayoutTemplate className={cls} strokeWidth={1.6} />;
  if (kind === "automation") return <Zap className={cls} strokeWidth={1.6} />;
  if (kind === "research") return <Workflow className={cls} strokeWidth={1.6} />;
  return <AppWindow className={cls} strokeWidth={1.6} />;
}

function RailBtn({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <BrowserChromeTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {children}
      </button>
    </BrowserChromeTooltip>
  );
}
