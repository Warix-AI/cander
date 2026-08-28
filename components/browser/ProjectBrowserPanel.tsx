"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
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
  Plus,
  RotateCw,
  Upload,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { GoogleHome } from "@/components/browser/GoogleHome";
import {
  MobileBottomSheet,
  ProjectActionsSheetBody,
  ProjectAddSheetHeader,
  ProjectInfoSheetHeader,
} from "@/components/browser/ProjectMobileSheets";
import { AppViewport } from "@/components/preview/AppViewport";
import { NavToggle } from "@/components/shell/NavToggle";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { Dropdown } from "@/components/ui/Controls";
import {
  getSpaceEntityStoreServerSnapshot,
  getSpaceEntityStoreSnapshot,
  subscribeSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  getProjectBrowserSessionRevision,
  makeProjectTab,
  makeUrlTab,
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
} from "@/lib/preview-url";
import type { ProjectKind, SpaceProject } from "@/lib/space-entities";
import { DESKTOP_NO_DRAG, useDesktopShell } from "@/lib/desktop-shell";
import {
  getSidebarPeeking,
  getSidebarPeekingServerSnapshot,
  subscribeSidebarPeeking,
} from "@/lib/sidebar-peek";
import { isChatSpace } from "@/lib/spaces";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function ProjectBrowserPanel() {
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
  } = useApp();
  const mobile = useMobileShell();
  const desktop = useDesktopShell();
  const [mobileSheet, setMobileSheet] = useState<"info" | "add" | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const peeking = useSyncExternalStore(
    subscribeSidebarPeeking,
    getSidebarPeeking,
    getSidebarPeekingServerSnapshot,
  );
  const chatArmed = drafting || Boolean(thread);
  const projectFullscreen = Boolean(projectId) && !chatArmed;
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

  const key: ProjectBrowserKey | null =
    projectId && spaceId && spaceId !== "connectors"
      ? {
          profileId: actor.id,
          workspaceId,
          spaceId,
          projectId,
        }
      : null;

  const entity = useMemo(() => {
    if (!projectId) return null;
    return (
      getSpaceEntityStoreSnapshot().projects.find(
        (item) => item.id === projectId && item.workspaceId === workspaceId,
      ) ?? null
    );
  }, [projectId, workspaceId, entityRevision]);

  const fallback = useMemo(() => {
    if (!projectId) {
      return defaultProjectBrowserSession({ projectId: "project", title: "Project" });
    }
    return defaultProjectBrowserSession({
      projectId,
      title: project?.name ?? entity?.title ?? "Project",
      publishedUrl: entity?.publishedUrl,
    });
  }, [projectId, project?.name, entity?.title, entity?.publishedUrl]);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const session =
    hydrated && key
      ? getProjectBrowserSession(key, fallback)
      : fallback;

  const active =
    session.tabs.find((tab) => tab.id === session.activeTabId) ?? session.tabs[0];
  const [urlDraft, setUrlDraft] = useState(active?.url ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setUrlDraft(active?.url ?? "");
  }, [active?.id, active?.url, sessionRevision]);

  const allProjects = useMemo(
    () =>
      getSpaceEntityStoreSnapshot().projects.filter(
        (item) => item.workspaceId === workspaceId,
      ),
    [workspaceId, entityRevision],
  );

  if (!key || !projectId || !active) return null;

  const write = (next: ProjectBrowserSession) => {
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
    const tab = makeUrlTab();
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
      (tab) => tab.kind === "project" && tab.projectId === item.id,
    );
    if (existing) {
      selectTab(existing.id);
      return;
    }
    const tab = makeProjectTab({
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

  const canBack = active.historyIndex > 0;
  const canForward = active.historyIndex < active.history.length - 1;
  const extraProjects = allProjects.filter((item) => item.id !== projectId);
  const address =
    liveUrl ??
    active.url ??
    previewUrlForProject(projectId ?? "project", entity?.publishedUrl);
  const published =
    entity?.status === "published" || Boolean(entity?.publishedUrl);
  const projectTitle = project?.name ?? entity?.title ?? active.title ?? "Project";

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
      {mobile ? null : (
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
          {showHeaderNav && spaceId && isChatSpace(spaceId) ? (
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
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {chatArmed ? (
              <button
                type="button"
                aria-label={expandedLayout ? "Restore layout" : "Expand"}
                title={expandedLayout ? "Restore layout" : "Expand"}
                onClick={() => toggleExpandedLayout()}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
              >
                {expandedLayout ? (
                  <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                )}
              </button>
            ) : null}
            {panelMode === "collapsed" ? null : (
              <button
                type="button"
                aria-label="Leave project"
                title="Leave project"
                onClick={() => backToSpaceHome()}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            )}
            {chatArmed ? <PanelToggle /> : null}
          </span>
        </div>
      )}

      {mobile ? null : (
        <div className="flex h-[45px] min-w-0 shrink-0 items-center gap-0.5 border-t border-border bg-sidebar px-2">
          <RailBtn
            label="Back"
            disabled={!canBack}
            onClick={() => goHistory(-1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <RailBtn
            label="Forward"
            disabled={!canForward}
            onClick={() => goHistory(1)}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <RailBtn label="Reload" onClick={() => setReloadKey((value) => value + 1)}>
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              commitUrl();
            }}
          >
            <input
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              onBlur={commitUrl}
              spellCheck={false}
              aria-label="Address"
              className="h-7 w-full bg-transparent px-2 font-mono text-[12px] text-muted-foreground outline-none"
            />
          </form>
          <DesktopProjectToolsMenu
            selectMode={selectMode}
            onPublish={() => openOverlay("publish")}
            onOpenExternal={() => window.open(address, "_blank")}
            onSelectElement={() => setSelectMode(!selectMode)}
            onRefresh={() => {
              refreshPreview();
              setReloadKey((value) => value + 1);
            }}
          />
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <ProjectBrowserBody
          tab={active}
          projects={allProjects}
          fallbackName={project?.name ?? "Project"}
          fallbackSummary={project?.summary ?? ""}
          reloadKey={reloadKey}
        />
        {mobile && mobileNavOpen ? (
          <MobileBrowserNavSheet
            urlDraft={urlDraft}
            canBack={canBack}
            canForward={canForward}
            onUrlChange={setUrlDraft}
            onCommitUrl={commitUrl}
            onBack={() => goHistory(-1)}
            onForward={() => goHistory(1)}
            onReload={() => setReloadKey((value) => value + 1)}
            onClose={() => setMobileNavOpen(false)}
          />
        ) : null}
      </div>
      {mobile ? (
        <ProjectMobileTabBar
          tabs={session.tabs}
          activeId={active.id}
          onSelect={selectTab}
          onOpenActive={() => setMobileSheet("info")}
          onClose={closeTab}
          onAdd={openAddSheet}
        />
      ) : null}

      <MobileBottomSheet
        open={mobile && mobileSheet === "info"}
        onClose={() => setMobileSheet(null)}
        mode="info"
      >
        <ProjectInfoSheetHeader
          title={projectTitle}
          onClose={() => setMobileSheet(null)}
        />
        <ProjectActionsSheetBody
          published={published}
          statusNote={
            published
              ? "Your website is up to date."
              : "Publish to share a live link."
          }
          address={address}
          selectMode={selectMode}
          onPublish={() => {
            openOverlay("publish");
            setMobileSheet(null);
          }}
          onOpenExternal={() => {
            window.open(address, "_blank");
            setMobileSheet(null);
          }}
          onSelectElement={() => {
            setSelectMode(!selectMode);
            setMobileSheet(null);
          }}
          onRefresh={() => {
            refreshPreview();
            setReloadKey((value) => value + 1);
            setMobileSheet(null);
          }}
          onEditAddress={() => {
            setMobileSheet(null);
            setMobileNavOpen(true);
          }}
          onCopyAddress={() => {
            void navigator.clipboard?.writeText(address);
          }}
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
          onClose={() => setMobileSheet(null)}
          onSubmit={submitAddQuery}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
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
}: {
  tab: ProjectBrowserTab;
  projects: SpaceProject[];
  fallbackName: string;
  fallbackSummary: string;
  reloadKey: number;
}) {
  if (tab.kind === "url" && isGoogleUrl(tab.url)) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-white">
        <GoogleHome />
      </div>
    );
  }

  if (tab.kind === "project") {
    const match =
      projects.find((item) => item.id === tab.projectId) ?? null;
    if (match?.publishedUrl && isHttpUrl(match.publishedUrl)) {
      return (
        <iframe
          key={`${tab.id}-${reloadKey}-${match.publishedUrl}`}
          title={tab.title}
          src={match.publishedUrl}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="h-full w-full border-0 bg-white"
        />
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
      <iframe
        key={`${tab.id}-${reloadKey}-${tab.url}`}
        title={tab.title}
        src={tab.url}
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="h-full w-full border-0 bg-white"
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
      Enter a URL to open a page.
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
}: {
  tabs: ProjectBrowserTab[];
  activeId: string;
  projects: SpaceProject[];
  extraProjects: SpaceProject[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAddUrl: () => void;
  onAddProject: (project: SpaceProject) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
      <AddTabMenu
        extraProjects={extraProjects}
        onAddUrl={onAddUrl}
        onAddProject={onAddProject}
      />
    </div>
  );
}

function ProjectMobileTabBar({
  tabs,
  activeId,
  onSelect,
  onOpenActive,
  onClose,
  onAdd,
}: {
  tabs: ProjectBrowserTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onOpenActive: () => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-sidebar px-2 py-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.375rem)]">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (active) onOpenActive();
              else onSelect(tab.id);
            }}
            className={cn(
              "inline-flex h-9 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] tracking-[-0.01em]",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground",
            )}
          >
            <TabGlyph tab={tab} className="h-3.5 w-3.5" />
            <span className="truncate">{tab.title}</span>
            {tab.pinned ? null : (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Close ${tab.title}`}
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
                className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-background/20"
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
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" strokeWidth={1.8} />
      </button>
    </div>
  );
}

function DesktopProjectToolsMenu({
  selectMode,
  onPublish,
  onOpenExternal,
  onSelectElement,
  onRefresh,
}: {
  selectMode: boolean;
  onPublish: () => void;
  onOpenExternal: () => void;
  onSelectElement: () => void;
  onRefresh: () => void;
}) {
  return (
    <Dropdown
      align="end"
      matchTrigger={false}
      menuClassName="min-w-[14rem]"
      trigger={({ toggle }) => (
        <RailBtn label="Project tools" onClick={toggle}>
          <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
      )}
    >
      {(close) => (
        <>
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
    </Dropdown>
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
      <div className="relative mx-3 mb-3 rounded-[16px] border border-border bg-background p-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
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
              className="h-9 w-full rounded-lg bg-muted/60 px-3 font-mono text-[12px] text-foreground outline-none"
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
      <span className="truncate">{tab.title}</span>
      {tab.pinned ? null : (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Close ${tab.title}`}
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
    <Dropdown
      align="start"
      matchTrigger={false}
      menuClassName="min-w-[14rem] max-h-[min(20rem,50vh)] overflow-y-auto"
      trigger={({ toggle }) => (
        <button
          type="button"
          aria-label="New tab"
          title="New tab"
          onClick={toggle}
          className={cn(
            "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground",
            compact ? "h-9 w-9 rounded-full" : "h-7 w-7 rounded-lg",
          )}
        >
          <Plus className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.8} />
        </button>
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
            New tab
          </button>
          {extraProjects.length ? (
            <>
              <p className="px-2.5 pt-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                Projects
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
    </Dropdown>
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
  if (tab.kind === "url") {
    if (isGoogleUrl(tab.url)) {
      return (
        <span
          aria-hidden
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] font-medium leading-none"
        >
          <span className="bg-gradient-to-br from-[#4285F4] via-[#34A853] to-[#EA4335] bg-clip-text text-transparent">
            G
          </span>
        </span>
      );
    }
    return <Globe className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={1.6} />;
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
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}
