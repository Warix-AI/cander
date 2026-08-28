"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AppWindow,
  ChevronLeft,
  ChevronRight,
  Globe,
  LayoutTemplate,
  Plus,
  RotateCw,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { GoogleHome } from "@/components/browser/GoogleHome";
import { AppViewport } from "@/components/preview/AppViewport";
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
  } = useApp();
  const mobile = useMobileShell();
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

  const addUrlTab = () => {
    const tab = makeUrlTab();
    write({
      tabs: [...session.tabs, tab],
      activeTabId: tab.id,
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

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-sidebar">
      {mobile ? null : (
        <div className="flex h-10 min-w-0 shrink-0 items-center gap-1 bg-sidebar px-2">
          <ProjectTabStrip
            tabs={session.tabs}
            activeId={active.id}
            projects={allProjects}
            onSelect={selectTab}
            onClose={closeTab}
            onAddUrl={addUrlTab}
            onAddProject={addProjectTab}
            extraProjects={extraProjects}
          />
          <button
            type="button"
            aria-label="Leave project"
            title="Leave project"
            onClick={() => backToSpaceHome()}
            className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          {drafting || thread ? <PanelToggle /> : null}
        </div>
      )}

      <div className="flex h-10 min-w-0 shrink-0 items-center gap-0.5 bg-sidebar px-2">
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
            className="h-7 w-full rounded-lg bg-background px-2.5 font-mono text-[12px] text-foreground outline-none ring-1 ring-border/80 focus:ring-foreground/20"
          />
        </form>
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden bg-background",
          mobile && "pb-[4.25rem]",
        )}
      >
        <ProjectBrowserBody
          tab={active}
          projects={allProjects}
          fallbackName={project?.name ?? "Project"}
          fallbackSummary={project?.summary ?? ""}
          reloadKey={reloadKey}
        />
        {mobile ? (
          <ProjectMobileTabBar
            tabs={session.tabs}
            activeId={active.id}
            extraProjects={extraProjects}
            onSelect={selectTab}
            onClose={closeTab}
            onAddUrl={addUrlTab}
            onAddProject={addProjectTab}
          />
        ) : null}
      </div>
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
    if (match?.publishedUrl) {
      return (
        <iframe
          key={`${tab.id}-${reloadKey}-${match.publishedUrl}`}
          title={tab.title}
          src={match.publishedUrl}
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
  extraProjects,
  onSelect,
  onClose,
  onAddUrl,
  onAddProject,
}: {
  tabs: ProjectBrowserTab[];
  activeId: string;
  extraProjects: SpaceProject[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAddUrl: () => void;
  onAddProject: (project: SpaceProject) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
      <div className="pointer-events-auto mx-3 flex items-center gap-1 overflow-x-auto rounded-full border border-border/80 bg-background/90 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              "inline-flex h-9 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] tracking-[-0.01em]",
              tab.id === activeId
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
        ))}
        <AddTabMenu
          extraProjects={extraProjects}
          onAddUrl={onAddUrl}
          onAddProject={onAddProject}
          compact
        />
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
