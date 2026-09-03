"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import {
  AppWindow,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  ExternalLink,
  FileText,
  Globe,
  Image,
  LayoutTemplate,
  Maximize2,
  MessageSquare,
  Minimize2,
  MousePointer2,
  Pencil,
  Plus,
  LoaderCircle,
  RotateCw,
  Share,
  Trash2,
  Upload,
  Video,
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
import {
  BrowserChromeIconButton,
  PanelToggle,
  clearBrowserChromeHovers,
} from "@/components/shell/PanelToggle";
import { Dropdown } from "@/components/ui/Controls";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { MeshDriftShader } from "@/components/ui/MeshDriftShader";
import { StudioImageToolbar } from "@/components/studio/StudioImageToolbar";
import {
  BROWSER_CHROME_BG,
  BROWSER_CHROME_CHIP,
  BROWSER_CHROME_CHIP_HOVER,
} from "@/lib/shell-chrome";
import { decodeTextDataUrl } from "@/lib/chat-document-attach";
import { updateChatThreads } from "@/lib/api/chat-store";
import {
  publishMarkdownShare,
  renameMarkdownShare,
} from "@/lib/shared-markdown-client";
import {
  markdownShareUrl,
  newMarkdownShareId,
} from "@/lib/shared-markdown";
import { useSpaceMutation, useSpaceProject } from "@/lib/hooks/use-space-query";
import {
  editStudioProjectImage,
  fetchLatestStudioProjectAsset,
  isStudioAssetUrl,
  studioAspectParts,
  studioPresetById,
  uploadStudioProjectAsset,
  type StudioResizePresetId,
} from "@/lib/studio-assets-client";
import { studioCoverAcceptsFirstGenerated } from "@/lib/project-cover";
import { saveGeneratedImage } from "@/lib/native/save-image";
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
  isStudioMediaTabKind,
  makeProjectPreviewTab,
  makeStudioMediaTab,
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
  const [renameTarget, setRenameTarget] = useState<"project" | "document">(
    "project",
  );
  const [shareCopied, setShareCopied] = useState(false);
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
    if (active?.kind === "studio-document" && decodeTextDataUrl(active.url ?? "")) {
      const shareUrl = active.shareId
        ? markdownShareUrl(active.shareId)
        : "";
      setUrlDraft(shareUrl);
      return;
    }
    const next =
      active?.kind === "agent-browser"
        ? (computerSession?.currentUrl ?? active.url)
        : (active?.url ?? "");
    setUrlDraft(next);
  }, [
    active?.id,
    active?.url,
    active?.kind,
    active?.shareId,
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
    if (session.tabs.length <= 1) return;
    const tabs = session.tabs.filter((item) => item.id !== id);
    if (!tabs.length) return;
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

  const addStudioMediaTab = (
    kind: "studio-image" | "studio-document",
  ) => {
    const tab = makeStudioMediaTab(kind);
    write({
      tabs: [...session.tabs, tab],
      activeTabId: tab.id,
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
    if (
      active.kind === "studio-document" &&
      decodeTextDataUrl(active.url) != null
    ) {
      // Markdown tabs keep a public share URL in the address bar — do not navigate.
      setUrlDraft(
        active.shareId ? markdownShareUrl(active.shareId) : urlDraft,
      );
      return;
    }
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
    active.kind === "studio-document" &&
    decodeTextDataUrl(active.url) != null &&
    active.shareId
      ? markdownShareUrl(active.shareId)
      : active.kind === "agent-browser"
        ? (computerSession?.currentUrl ?? active.url)
        : standalone
          ? (liveUrl ?? active.url)
          : (liveUrl ??
            active.url ??
            previewUrlForProject(projectId ?? "project", entity?.publishedUrl));
  const isMarkdownDocTab =
    active.kind === "studio-document" &&
    decodeTextDataUrl(active.url) != null;
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
    (spaceId === "build" || spaceId === "research" || spaceId === "studio");
  /** Work space items hide URL/nav chrome until the user adds a browser tab. */
  const isWorkItemBrowser =
    !standalone && spaceId === "work" && isWorkItemBrowserProjectId(projectId);
  const isStudioProject = !standalone && spaceId === "studio";
  const showBrowserNavChrome = isMarkdownDocTab
    ? true
    : isStudioProject
      ? active?.kind === "web"
      : !isWorkItemBrowser || session.tabs.some((tab) => tab.kind === "web");

  const studioImageJobs = useMemo(() => {
    if (!isStudioProject || !thread) return [];
    const jobs: Extract<
      NonNullable<typeof thread.messages[number]["blocks"]>[number],
      { type: "image_generation" }
    >[] = [];
    for (const message of thread.messages) {
      for (const block of message.blocks ?? []) {
        if (block.type !== "image_generation") continue;
        if (block.status !== "generating" && block.status !== "completed") {
          continue;
        }
        if (!block.generationId?.trim()) continue;
        jobs.push(block);
      }
    }
    return jobs;
  }, [isStudioProject, thread]);

  const studioImageJobsSig = studioImageJobs
    .map(
      (job) =>
        `${job.generationId}:${job.status}:${job.imageUrl?.trim() ?? ""}`,
    )
    .join("|");

  // Every chat image generation gets its own Studio canvas tab.
  // Do NOT re-steal focus while another canvas generates.
  useEffect(() => {
    if (!isStudioProject || !key || !studioImageJobs.length) return;

    const isEmptyUnboundStudioTab = (tab: ProjectBrowserTab) =>
      tab.kind === "studio-image" &&
      !tab.boundGenerationId &&
      (!tab.url || tab.url === "" || tab.url === "about:blank");

    const current = getProjectBrowserSession(key, session);
    let nextTabs = current.tabs.slice();
    let changed = false;
    let focusTabId: string | null = null;

    studioImageJobs.forEach((job, index) => {
      const genId = job.generationId.trim();
      const label = index === 0 ? "Image" : `Image ${index + 1}`;
      let targetIndex = nextTabs.findIndex(
        (tab) =>
          tab.kind === "studio-image" && tab.boundGenerationId === genId,
      );

      if (targetIndex < 0) {
        const imageUrl = job.imageUrl?.trim() ?? "";
        const matchByUrl =
          imageUrl.length > 0
            ? nextTabs.findIndex(
                (tab) =>
                  tab.kind === "studio-image" &&
                  !tab.boundGenerationId &&
                  tab.url?.trim() === imageUrl,
              )
            : -1;
        if (matchByUrl >= 0) {
          const matched = nextTabs[matchByUrl]!;
          nextTabs[matchByUrl] = {
            ...matched,
            boundGenerationId: genId,
            title:
              matched.title === "Canvas" || matched.title === "Image"
                ? label
                : matched.title,
          };
          targetIndex = matchByUrl;
          changed = true;
        } else {
          const emptyIndex = nextTabs.findIndex(isEmptyUnboundStudioTab);
          if (emptyIndex >= 0) {
            const empty = nextTabs[emptyIndex]!;
            nextTabs[emptyIndex] = {
              ...empty,
              boundGenerationId: genId,
              title:
                empty.title === "Canvas" || empty.title === "Image"
                  ? label
                  : empty.title,
            };
            targetIndex = emptyIndex;
            changed = true;
            if (index === studioImageJobs.length - 1) {
              focusTabId = empty.id;
            }
          } else {
            const tab: ProjectBrowserTab = {
              ...makeStudioMediaTab("studio-image", label),
              boundGenerationId: genId,
            };
            nextTabs = [...nextTabs, tab];
            targetIndex = nextTabs.length - 1;
            changed = true;
            if (index === studioImageJobs.length - 1) {
              focusTabId = tab.id;
            }
          }
        }
      }

      const target = nextTabs[targetIndex];
      if (!target) return;

      const imageUrl = job.imageUrl?.trim();
      if (job.status === "completed" && imageUrl) {
        const existingUrl = target.url?.trim() ?? "";
        const hasCanvas =
          existingUrl.length > 0 && existingUrl !== "about:blank";
        // Seed once from chat; never clobber an edited / restored canvas.
        if (!hasCanvas) {
          nextTabs[targetIndex] = {
            ...target,
            boundGenerationId: genId,
            url: imageUrl,
            history: [imageUrl],
            historyIndex: 0,
            title:
              target.title === "Canvas" || target.title === "Document"
                ? label
                : target.title,
          };
          changed = true;
        } else if (target.boundGenerationId !== genId) {
          nextTabs[targetIndex] = { ...target, boundGenerationId: genId };
          changed = true;
        }
      } else if (target.boundGenerationId !== genId) {
        nextTabs[targetIndex] = { ...target, boundGenerationId: genId };
        changed = true;
      }
    });

    // Only jump focus when creating/binding the newest job onto a fresh tab.
    const activeTabId = focusTabId ?? current.activeTabId;
    if (!changed && activeTabId === current.activeTabId) return;
    write({ tabs: nextTabs, activeTabId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on job set signature
  }, [isStudioProject, key?.projectId, studioImageJobsSig]);

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
    if (renameTarget === "document" && isMarkdownDocTab) {
      setRenameValue(active.title || "Document");
    } else {
      setRenameValue(projectTitle);
    }
    setRenameError(null);
  }, [
    projectTitle,
    projectId,
    mobileSheet,
    desktopRenameOpen,
    renameTarget,
    active.title,
    isMarkdownDocTab,
  ]);

  // Ensure markdown document tabs have a public share id + published body.
  useEffect(() => {
    if (!isMarkdownDocTab || !key || !projectId || standalone) return;
    const markdown = decodeTextDataUrl(active.url);
    if (!markdown?.trim()) return;
    let cancelled = false;
    const ensure = async () => {
      const shareId = active.shareId?.trim() || newMarkdownShareId();
      if (!active.shareId) {
        const current = getProjectBrowserSession(key, fallback);
        setProjectBrowserSession(key, {
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.id === active.id ? { ...tab, shareId } : tab,
          ),
        });
      }
      try {
        const published = await publishMarkdownShare({
          workspaceId,
          projectId,
          title: active.title || "Document",
          markdown,
          shareId,
        });
        if (cancelled) return;
        if (published.id !== shareId || !active.shareId) {
          const current = getProjectBrowserSession(key, fallback);
          setProjectBrowserSession(key, {
            ...current,
            tabs: current.tabs.map((tab) =>
              tab.id === active.id
                ? { ...tab, shareId: published.id }
                : tab,
            ),
          });
        }
      } catch {
        // Offline / unsigned — local share URL still works for copy.
      }
    };
    void ensure();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish once per tab/content
  }, [isMarkdownDocTab, active.id, active.url, key?.projectId, projectId]);

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
      setRenameTarget("project");
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
      setRenameTarget("project");
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename project.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const saveDocumentName = async () => {
    if (!key || !isMarkdownDocTab) return;
    const next = renameValue.trim();
    if (!next) {
      setRenameError("Document name is required.");
      return;
    }
    if (next === active.title) {
      setRenameError(null);
      setDesktopRenameOpen(false);
      setMobileSheet(null);
      setRenameTarget("project");
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      const current = getProjectBrowserSession(key, fallback);
      setProjectBrowserSession(key, {
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === active.id ? { ...tab, title: next } : tab,
        ),
      });
      if (active.shareId) {
        await renameMarkdownShare({ shareId: active.shareId, title: next });
      }
      setDesktopRenameOpen(false);
      setMobileSheet(null);
      setRenameTarget("project");
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename document.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const openDocumentRename = () => {
    setRenameTarget("document");
    setRenameValue(active.title || "Document");
    setRenameError(null);
    if (mobile) setMobileSheet("rename");
    else setDesktopRenameOpen(true);
  };

  const copyMarkdownShareLink = async () => {
    if (!isMarkdownDocTab) return;
    const markdown = decodeTextDataUrl(active.url);
    if (!markdown?.trim() || !projectId) return;
    let shareId = active.shareId?.trim() || newMarkdownShareId();
    if (!active.shareId && key) {
      const current = getProjectBrowserSession(key, fallback);
      setProjectBrowserSession(key, {
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === active.id ? { ...tab, shareId } : tab,
        ),
      });
    }
    try {
      const published = await publishMarkdownShare({
        workspaceId,
        projectId,
        title: active.title || "Document",
        markdown,
        shareId,
      });
      shareId = published.id;
      if (key) {
        const current = getProjectBrowserSession(key, fallback);
        setProjectBrowserSession(key, {
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.id === active.id ? { ...tab, shareId } : tab,
          ),
        });
      }
    } catch {
      // Still copy the local share URL.
    }
    const url = markdownShareUrl(shareId);
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      window.prompt("Copy share link", url);
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
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        BROWSER_CHROME_BG,
      )}
    >
      {mobile ? null : standalone ? (
        <>
          <div
            className={cn(
              "flex h-11 min-w-0 shrink-0 items-center gap-1 px-2",
              BROWSER_CHROME_BG,
            )}
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
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-black/[0.06] dark:hover:bg-white/[0.1] hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </BrowserChromeTooltip>
                <PanelToggle />
              </span>
            ) : null}
          </div>
          <div
            className={cn(
              "relative flex h-10 min-w-0 shrink-0 items-center gap-0.5 border-t border-black/5 px-2 dark:border-white/5",
              BROWSER_CHROME_BG,
            )}
          >
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
            "flex h-[45px] min-w-0 shrink-0 items-center gap-1",
            BROWSER_CHROME_BG,
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
            onAddStudioMedia={addStudioMediaTab}
            extraProjects={extraProjects}
            studioMode={isStudioProject}
          />
          {readingPage ? (
            <span
              className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground"
              title="Cander is reading the active page"
            >
              Reading page
            </span>
          ) : null}
          <span
            className="ml-auto flex shrink-0 items-center gap-1"
            onPointerLeave={clearBrowserChromeHovers}
          >
            {panelMode === "collapsed" ? null : standalone ? (
              <BrowserChromeTooltip label="Close browser">
                <BrowserChromeIconButton
                  aria-label="Close browser"
                  onClick={() => closeStandaloneBrowser()}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </BrowserChromeIconButton>
              </BrowserChromeTooltip>
            ) : (
              <BrowserChromeTooltip label="Leave project">
                <BrowserChromeIconButton
                  aria-label="Leave project"
                  onClick={() => backToSpaceHome()}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </BrowserChromeIconButton>
              </BrowserChromeTooltip>
            )}
            {chatArmed ? (
              <BrowserChromeTooltip
                label={expandedLayout ? "Restore layout" : "Expand"}
              >
                <BrowserChromeIconButton
                  aria-label={expandedLayout ? "Restore layout" : "Expand"}
                  onClick={() => toggleExpandedLayout()}
                >
                  {expandedLayout ? (
                    <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  )}
                </BrowserChromeIconButton>
              </BrowserChromeTooltip>
            ) : null}
            {chatArmed ? (
              <BrowserChromeTooltip
                label={
                  panelMode === "collapsed"
                    ? "Open right panel"
                    : "Close right panel"
                }
              >
                <PanelToggle />
              </BrowserChromeTooltip>
            ) : null}
          </span>
        </div>
      )}

      {mobile ? null : standalone ? null : showBrowserNavChrome ? (
        <div
          className={cn(
            "relative flex h-[45px] min-w-0 shrink-0 items-center gap-0.5 border-t border-black/5 px-2 dark:border-white/5",
            BROWSER_CHROME_BG,
          )}
        >
          {isMarkdownDocTab ? null : (
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
          )}
          <div
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center",
              isMarkdownDocTab ? "px-20" : "px-[7.5rem]",
            )}
          >
            {isMarkdownDocTab ? (
              <button
                type="button"
                onClick={() => void copyMarkdownShareLink()}
                aria-label={shareCopied ? "Link copied" : "Copy share link"}
                className="pointer-events-auto mx-auto flex h-8 min-w-0 max-w-[min(100%,22rem)] flex-1 items-center justify-center rounded-full px-3 transition-colors duration-200 hover:bg-muted/50"
              >
                <span className="truncate text-[13px] font-normal tracking-[-0.01em] text-foreground">
                  {shareCopied
                    ? "Link copied"
                    : displayHostFromUrl(address) || "Generating share link…"}
                </span>
              </button>
            ) : (
              <BrowserAddressField
                className="pointer-events-auto w-full"
                url={address}
                faviconUrl={active.faviconUrl}
                draft={urlDraft}
                onDraftChange={setUrlDraft}
                onCommit={commitUrl}
                showFavicon={false}
              />
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {isMarkdownDocTab ? (
              <>
                <RailBtn
                  label={shareCopied ? "Copied" : "Share"}
                  onClick={() => void copyMarkdownShareLink()}
                >
                  <Share className="h-3.5 w-3.5" strokeWidth={1.6} />
                </RailBtn>
                <RailBtn label="Rename" onClick={openDocumentRename}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                </RailBtn>
              </>
            ) : standalone ? (
              <>
                <RailBtn
                  label="Open in new tab"
                  onClick={() => addUrlTab(address)}
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
                </RailBtn>
              </>
            ) : (
              <DesktopProjectToolsMenu
                selectMode={selectMode}
                canRename={canRename}
                onRename={() => {
                  setRenameTarget("project");
                  setDesktopRenameOpen(true);
                }}
                onPublish={() => openOverlay("publish")}
                onDomain={() => openOverlay("domains")}
                onOpenExternal={() => addUrlTab(address)}
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
            <p className="text-[14px] font-medium tracking-[-0.01em]">
              {renameTarget === "document" ? "Rename document" : "Rename project"}
            </p>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void (renameTarget === "document"
                    ? saveDocumentName()
                    : saveProjectName());
                }
                if (event.key === "Escape") {
                  setDesktopRenameOpen(false);
                  setRenameTarget("project");
                }
              }}
              spellCheck={false}
              className="mt-3 h-10 w-full rounded-[12px] border border-border bg-muted/40 px-3 text-[14px] outline-none"
            />
            {renameError ? (
              <p className="mt-2 text-[12px] text-destructive">{renameError}</p>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                {renameTarget === "document"
                  ? "Shown on the tab and share page."
                  : "Must be unique across this workspace."}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDesktopRenameOpen(false);
                  setRenameTarget("project");
                }}
                className="h-9 rounded-[10px] px-3 text-[13px] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={renameBusy}
                onClick={() =>
                  void (renameTarget === "document"
                    ? saveDocumentName()
                    : saveProjectName())
                }
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
            key={active.id}
            tab={active}
            projects={allProjects}
            fallbackName={previewFallbackName}
          fallbackSummary={previewFallbackSummary}
          reloadKey={reloadKey}
          userId={actor.id}
          browserKey={key}
          surfaceActive={surfaceActive}
          workspaceId={workspaceId}
          projectId={projectId}
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
          aria-label={
            isMarkdownDocTab
              ? shareCopied
                ? "Link copied"
                : "Copy share link"
              : "Edit address"
          }
          onClick={() => {
            if (isMarkdownDocTab) void copyMarkdownShareLink();
            else setMobileNavOpen(true);
          }}
          className={cn(
            "relative z-10 flex shrink-0 items-center border-t border-black/5 px-3 py-2.5 dark:border-white/5",
            BROWSER_CHROME_BG,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-center font-mono text-[13px] text-muted-foreground">
            {isMarkdownDocTab
              ? shareCopied
                ? "Link copied"
                : displayHostFromUrl(address) || "Generating share link…"
              : displayHostFromUrl(address) || "Enter URL"}
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
          onCancel={() => {
            setMobileSheet(null);
            setRenameTarget("project");
          }}
          onSave={() =>
            void (renameTarget === "document"
              ? saveDocumentName()
              : saveProjectName())
          }
        />
      </MobileBottomSheet>

      <MobileBottomSheet
        open={mobile && mobileSheet === "add"}
        onClose={() => setMobileSheet(null)}
        mode="add"
      >
        {isStudioProject ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3">
            <p className="px-1 pb-2 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              Add to project
            </p>
            {(
              [
                { kind: "studio-image" as const, label: "Image", Icon: Image },
              ] as const
            ).map((item) => {
              const Icon = item.Icon;
              return (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => {
                    addStudioMediaTab(item.kind);
                    setMobileSheet(null);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2.5 text-left text-[15px] hover:bg-muted/70"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                addUrlTab();
                setMobileSheet(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2.5 text-left text-[15px] hover:bg-muted/70"
            >
              <Globe className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              <span>Browser tab</span>
            </button>
            {extraProjects.length ? (
              <>
                <p className="mt-3 px-1 pb-2 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                  Other projects
                </p>
                {extraProjects.map((item) => (
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
                ))}
              </>
            ) : null}
          </div>
        ) : (
          <>
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
          </>
        )}
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
  workspaceId,
  projectId,
}: {
  tab: ProjectBrowserTab;
  projects: SpaceProject[];
  fallbackName: string;
  fallbackSummary: string;
  reloadKey: number;
  userId: string;
  browserKey: ProjectBrowserKey;
  surfaceActive: boolean;
  workspaceId: string;
  projectId: string | null;
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

  const openNewInAppTab = (raw: string) => {
    const url = normalizeBrowserUrl(raw);
    if (!url || url === "about:blank") return;
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
    const current =
      browserKey.projectId === STANDALONE_BROWSER_PROJECT_ID
        ? getStandaloneBrowserSession(browserKey, sessionFallback)
        : getProjectBrowserSession(browserKey, sessionFallback);
    const nextTab = navigateProjectBrowserTab(makeWebTab(), url);
    const next = {
      tabs: [...current.tabs, nextTab],
      activeTabId: nextTab.id,
    };
    if (browserKey.projectId === STANDALONE_BROWSER_PROJECT_ID) {
      setStandaloneBrowserSession(browserKey, next);
    } else {
      setProjectBrowserSession(browserKey, next);
    }
  };

  const syncSurfaceMeta = (patch: {
    url?: string;
    title?: string;
    faviconUrl?: string | null;
    boundGenerationId?: string | null;
    aspectRatio?: string | null;
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
      if (patch.url !== undefined && patch.url !== item.url) {
        if (!patch.url) {
          next = {
            ...next,
            url: patch.url,
            history: [patch.url],
            historyIndex: 0,
            ...(patch.title ? { title: patch.title } : {}),
          };
        } else if (item.kind === "studio-image") {
          // Studio canvas keeps only the latest version — no back-stack of edits.
          next = {
            ...next,
            url: patch.url,
            history: [patch.url],
            historyIndex: 0,
            ...(patch.title ? { title: patch.title } : {}),
          };
        } else {
          next = navigateProjectBrowserTab(next, patch.url, patch.title);
        }
      } else if (patch.title && patch.title !== item.title) {
        next = { ...next, title: patch.title };
      }
      if (
        patch.faviconUrl !== undefined &&
        patch.faviconUrl !== item.faviconUrl
      ) {
        next = { ...next, faviconUrl: patch.faviconUrl };
      }
      if (patch.boundGenerationId !== undefined) {
        next = {
          ...next,
          boundGenerationId: patch.boundGenerationId || undefined,
        };
      }
      if (patch.aspectRatio !== undefined) {
        next = { ...next, aspectRatio: patch.aspectRatio };
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
          onOpenNewTab={openNewInAppTab}
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
            onOpenNewTab={openNewInAppTab}
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

  if (isStudioMediaTabKind(tab.kind)) {
    return (
      <StudioMediaSurface
        kind={tab.kind}
        src={tab.url}
        workspaceId={workspaceId}
        projectId={projectId}
        boundGenerationId={tab.boundGenerationId}
        lockedAspectRatio={tab.aspectRatio}
        onOpenUrl={openNewInAppTab}
        onSrcChange={(nextUrl) =>
          syncSurfaceMeta(
            nextUrl === "about:blank"
              ? {
                  url: nextUrl,
                  title: tab.title,
                  boundGenerationId: null,
                  aspectRatio: null,
                }
              : { url: nextUrl, title: tab.title },
          )
        }
        onAspectRatioChange={(aspectRatio) =>
          syncSurfaceMeta({ aspectRatio })
        }
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
          onOpenNewTab={openNewInAppTab}
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
  onAddStudioMedia,
  studioMode = false,
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
  onAddStudioMedia?: (
    kind: "studio-image" | "studio-document",
  ) => void;
  studioMode?: boolean;
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
          canClose={tabs.length > 1 && !tab.pinned}
        />
      ))}
      {webOnly ? (
        <BrowserChromeTooltip label="New tab">
          <button
            type="button"
            aria-label="New tab"
            onClick={onAddUrl}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-black/[0.06] dark:hover:bg-white/[0.1] hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </BrowserChromeTooltip>
      ) : (
        <AddTabMenu
          extraProjects={extraProjects}
          onAddUrl={onAddUrl}
          onAddProject={onAddProject}
          onAddStudioMedia={onAddStudioMedia}
          studioMode={studioMode}
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
    <div
      className={cn(
        "relative z-10 flex shrink-0 items-center gap-1.5 overflow-hidden border-t border-black/5 px-2 py-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.375rem)] dark:border-white/5",
        BROWSER_CHROME_BG,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const label = labelFor(tab);
        const canClose = tabs.length > 1 && !tab.pinned;
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
            {canClose ? (
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
            ) : null}
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
            Open in new tab
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
  canClose = true,
}: {
  tab: ProjectBrowserTab;
  active: boolean;
  project?: SpaceProject;
  onSelect: () => void;
  onClose: () => void;
  canClose?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group inline-flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] tracking-[-0.01em] transition-colors duration-200",
        active
          ? cn(BROWSER_CHROME_CHIP, "text-foreground")
          : cn("text-muted-foreground", BROWSER_CHROME_CHIP_HOVER, "hover:text-foreground"),
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
      {canClose ? (
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
      ) : null}
    </button>
  );
}

function AddTabMenu({
  extraProjects,
  onAddUrl,
  onAddProject,
  onAddStudioMedia,
  studioMode = false,
  compact = false,
}: {
  extraProjects: SpaceProject[];
  onAddUrl: () => void;
  onAddProject: (project: SpaceProject) => void;
  onAddStudioMedia?: (
    kind: "studio-image" | "studio-document",
  ) => void;
  studioMode?: boolean;
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
              "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-black/[0.06] dark:hover:bg-white/[0.1] hover:text-foreground",
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
          {studioMode && onAddStudioMedia ? (
            <>
              {(
                [
                  { kind: "studio-image" as const, label: "Image", Icon: Image },
                ] as const
              ).map((item) => {
                const Icon = item.Icon;
                return (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddStudioMedia(item.kind);
                      close();
                    }}
                    className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    <Icon
                      className="h-3.5 w-3.5 text-muted-foreground"
                      strokeWidth={1.6}
                    />
                    {item.label}
                  </button>
                );
              })}
            </>
          ) : null}
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
            {studioMode ? "Browser tab" : "New browser tab"}
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

type StudioCanvasActivity =
  | { type: "upload" }
  | { type: "edit"; ratio: string };

function studioArtboardStyle(ratioW: number, ratioH: number): {
  width: string;
  height: string;
} {
  // ~20% larger than chat gen cards so canvas reads as the primary surface.
  return {
    width: `min(100cqw, 37.44rem, calc(100cqh * ${ratioW} / ${ratioH}))`,
    height: `min(100cqh, calc(37.44rem * ${ratioH} / ${ratioW}), calc(100cqw * ${ratioH} / ${ratioW}))`,
  };
}

function StudioMediaSurface({
  kind,
  src,
  workspaceId,
  projectId,
  boundGenerationId,
  lockedAspectRatio,
  onSrcChange,
  onAspectRatioChange,
  onOpenUrl,
}: {
  kind: "studio-image" | "studio-video" | "studio-document";
  src: string;
  workspaceId: string;
  projectId: string | null;
  boundGenerationId?: string;
  lockedAspectRatio?: string | null;
  onSrcChange: (next: string) => void;
  onAspectRatioChange: (ratio: string | null) => void;
  onOpenUrl?: (url: string) => void;
}) {
  const { ctx } = useSpaceData();
  const { updateProject } = useSpaceMutation();
  const { project } = useSpaceProject(projectId);
  const { thread } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const appliedGenerationRef = useRef<string | null>(null);
  const [activity, setActivity] = useState<StudioCanvasActivity | null>(null);
  const [naturalRatio, setNaturalRatio] = useState(() =>
    studioAspectParts(lockedAspectRatio),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accept =
    kind === "studio-image"
      ? "image/*"
      : kind === "studio-video"
        ? "video/*"
        : ".pdf,.doc,.docx,.txt,.md,application/pdf,text/*";
  const label =
    kind === "studio-image"
      ? "image"
      : kind === "studio-video"
        ? "video"
        : "document";
  const Icon =
    kind === "studio-image" ? Image : kind === "studio-video" ? Video : FileText;
  const hasMedia = Boolean(src && src !== "about:blank");
  const isUploading = activity?.type === "upload";
  const isEditing = activity?.type === "edit";

  const imageJob = useMemo(() => {
    if (kind !== "studio-image" || !thread || !boundGenerationId) return null;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const message = thread.messages[i]!;
      const blocks = message.blocks;
      if (!blocks) continue;
      for (let j = blocks.length - 1; j >= 0; j--) {
        const block = blocks[j]!;
        if (block.type !== "image_generation") continue;
        if (block.generationId !== boundGenerationId) continue;
        return block;
      }
    }
    return null;
  }, [kind, thread, boundGenerationId]);

  const isGenerating =
    kind === "studio-image" &&
    Boolean(boundGenerationId) &&
    imageJob?.generationId === boundGenerationId &&
    imageJob?.status === "generating";
  const showMesh = isGenerating || isEditing;
  const lockedParts = lockedAspectRatio
    ? studioAspectParts(lockedAspectRatio)
    : null;
  const frameRatio =
    activity?.type === "edit"
      ? studioAspectParts(activity.ratio)
      : lockedParts
        ? lockedParts
        : isGenerating
          ? { w: 1, h: 1 }
          : naturalRatio;

  const lockAspect = (ratio: string) => {
    const parts = studioAspectParts(ratio);
    setNaturalRatio(parts);
    onAspectRatioChange(ratio);
  };

  const persistCanvasImage = async (
    dataUrl: string,
    source: "upload" | "generate" | "remove-bg" | "resize" | "suggest-edit",
    aspectRatio?: string | null,
  ) => {
    if (!projectId) {
      onSrcChange(dataUrl);
      return;
    }
    const stored = await uploadStudioProjectAsset({
      workspaceId,
      projectId,
      dataUrl,
      source,
      aspectRatio,
    });
    onSrcChange(stored.url);
    if (
      source === "generate" &&
      project &&
      studioCoverAcceptsFirstGenerated(project.cover)
    ) {
      void updateProject(ctx, projectId, { cover: stored.url }).catch(() => {});
    }
  };

  useEffect(() => {
    if (!hasMedia && !lockedAspectRatio) setNaturalRatio({ w: 1, h: 1 });
  }, [hasMedia, lockedAspectRatio]);

  useEffect(() => {
    if (!lockedAspectRatio) return;
    setNaturalRatio(studioAspectParts(lockedAspectRatio));
  }, [lockedAspectRatio]);

  // Restore empty canvases. Bound tabs use their chat generation URL — never
  // steal the project's newest asset onto the wrong tab.
  useEffect(() => {
    if (kind !== "studio-image" || !projectId) return;
    if (hasMedia || src === "about:blank") return;
    if (isGenerating || activity) return;

    if (boundGenerationId) {
      const fromJob = imageJob?.imageUrl?.trim();
      if (fromJob) {
        onSrcChange(fromJob);
        return;
      }
      if (imageJob?.status === "generating") return;
    }

    let cancelled = false;
    void fetchLatestStudioProjectAsset({ workspaceId, projectId })
      .then((asset) => {
        if (cancelled || !asset?.url) return;
        onSrcChange(asset.url);
        if (asset.aspectRatio) onAspectRatioChange(asset.aspectRatio);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once when empty
  }, [
    kind,
    projectId,
    workspaceId,
    hasMedia,
    src,
    isGenerating,
    activity?.type,
    boundGenerationId,
    imageJob?.status,
    imageJob?.imageUrl,
  ]);

  useEffect(() => {
    if (kind !== "studio-image") return;
    if (!imageJob || imageJob.status !== "completed") return;
    const url = imageJob.imageUrl?.trim();
    if (!url) return;
    if (appliedGenerationRef.current === imageJob.generationId) return;

    // Durable canvas already exists (including edits) — do not re-seed from chat.
    if (isStudioAssetUrl(src)) {
      appliedGenerationRef.current = imageJob.generationId;
      return;
    }

    appliedGenerationRef.current = imageJob.generationId;

    let cancelled = false;

    // Persist into studio_project_assets even when chat already rewrote the URL
    // to a durable attachment path (so other clients can restore the canvas).
    const shouldPersist =
      Boolean(projectId) &&
      (url.startsWith("data:") ||
        url.includes("/api/ai/raw-openai/attachments/") ||
        (!isStudioAssetUrl(url) && url.startsWith("http")));

    if (!shouldPersist) return;

    void (async () => {
      try {
        let dataUrl = url;
        if (!dataUrl.startsWith("data:")) {
          const res = await fetch(dataUrl, { credentials: "include" });
          if (!res.ok) throw new Error("Could not load generated image.");
          const blob = await res.blob();
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error("Could not read image."));
            reader.onerror = () => reject(new Error("Could not read image."));
            reader.readAsDataURL(blob);
          });
        }
        if (cancelled) return;
        await persistCanvasImage(
          dataUrl,
          "generate",
          lockedAspectRatio ?? null,
        );
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not save generated image.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist when job completes
  }, [kind, imageJob?.generationId, imageJob?.status, imageJob?.imageUrl, src]);

  const runEdit = async (
    action: "remove-bg" | "resize" | "suggest-edit",
    opts?: { resizePreset?: StudioResizePresetId; prompt?: string },
  ) => {
    if (!projectId || !src || activity) return;
    const resizePreset = opts?.resizePreset;
    const ratio =
      action === "resize" && resizePreset
        ? studioPresetById(resizePreset).ratio
        : lockedAspectRatio ||
          `${naturalRatio.w}:${naturalRatio.h}`;
    // Switch artboard immediately so the mesh matches the destination frame.
    lockAspect(ratio);
    setActivity({ type: "edit", ratio });
    setError(null);
    try {
      const result = await editStudioProjectImage({
        workspaceId,
        projectId,
        imageUrl: src,
        action,
        resizePreset,
        prompt: opts?.prompt,
        aspectRatio: ratio,
      });
      onSrcChange(result.url);
      if (result.aspectRatio) lockAspect(result.aspectRatio);
      else lockAspect(ratio);
      // Chat card + bind effect should track the edited image as canonical.
      if (boundGenerationId) {
        updateChatThreads((current) =>
          current.map((item) => ({
            ...item,
            messages: item.messages.map((message) => ({
              ...message,
              blocks: (message.blocks || []).map((block) =>
                block.type === "image_generation" &&
                block.generationId === boundGenerationId
                  ? {
                      ...block,
                      status: "completed" as const,
                      imageUrl: result.url,
                    }
                  : block,
              ),
            })),
          })),
        );
      }
      // Cover follows the latest canvas version.
      void updateProject(ctx, projectId, { cover: result.url }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed.");
    } finally {
      setActivity(null);
    }
  };

  const startUpload = (file: File) => {
    setActivity({ type: "upload" });
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setActivity(null);
        return;
      }
      void (async () => {
        try {
          if (kind === "studio-image") {
            await persistCanvasImage(result, "upload");
          } else {
            onSrcChange(result);
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not upload image.",
          );
        } finally {
          setActivity(null);
        }
      })();
    };
    reader.onerror = () => {
      setActivity(null);
      setError("Could not read that file.");
    };
    reader.readAsDataURL(file);
  };

  const downloadCurrent = () => {
    if (!src || saving) return;
    setSaving(true);
    setError(null);
    const name =
      kind === "studio-video" ? "studio-video.mp4" : "studio-image.png";
    void saveGeneratedImage({ url: src, name })
      .then((res) => {
        if (!res.ok) {
          setError(res.error || "Could not download.");
        }
      })
      .finally(() => setSaving(false));
  };

  const canvasBusy = Boolean(activity) || isGenerating;
  const showImageArtboard =
    kind === "studio-image" && (hasMedia || isGenerating || isEditing);
  const showEmpty =
    !hasMedia && !isGenerating && !isEditing && !isUploading;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        BROWSER_CHROME_BG,
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          startUpload(file);
        }}
      />
      {kind === "studio-image" && (hasMedia || isGenerating || isEditing) ? (
        <StudioImageToolbar
          busy={canvasBusy}
          onRemoveBackground={() => void runEdit("remove-bg")}
          onResize={(preset) => void runEdit("resize", { resizePreset: preset })}
          onSuggestEdit={(prompt) =>
            void runEdit("suggest-edit", { prompt })
          }
        />
      ) : null}

      {isUploading && !hasMedia ? (
        <div
          className="flex h-full items-center justify-center"
          role="status"
          aria-label="Uploading image"
        >
          <LoaderCircle
            className="h-7 w-7 animate-spin text-muted-foreground"
            strokeWidth={1.75}
          />
        </div>
      ) : showImageArtboard ? (
        <div className="@container flex min-h-0 flex-1 items-center justify-center px-8 pt-[4.75rem] pb-[4.25rem]">
          <div
            className="relative overflow-hidden rounded-[18px] bg-neutral-200/80 shadow-[0_10px_32px_rgba(0,0,0,0.08)] transition-[width,height] duration-300 ease-out dark:bg-neutral-900"
            style={studioArtboardStyle(frameRatio.w, frameRatio.h)}
          >
            {hasMedia && !showMesh ? (
              <img
                src={src}
                alt=""
                className={cn(
                  "h-full w-full object-contain transition-opacity duration-200",
                  isUploading && "opacity-40",
                )}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    // Keep a locked resize ratio (e.g. portrait) even if the
                    // model returns a different pixel aspect.
                    if (!lockedAspectRatio) {
                      setNaturalRatio({
                        w: img.naturalWidth,
                        h: img.naturalHeight,
                      });
                    }
                  }
                }}
              />
            ) : null}
            {showMesh ? (
              <div
                className="absolute inset-0 overflow-hidden"
                role="status"
                aria-label={isEditing ? "Editing image" : "Generating image"}
              >
                <MeshDriftShader active />
              </div>
            ) : null}
            {isUploading && hasMedia ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center"
                role="status"
                aria-label="Uploading image"
              >
                <LoaderCircle
                  className="h-7 w-7 animate-spin text-foreground"
                  strokeWidth={1.75}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : hasMedia && kind === "studio-video" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-7 py-12">
          <video
            src={src}
            controls
            className="max-h-full max-w-full"
          />
        </div>
      ) : hasMedia && kind === "studio-document" && src.startsWith("data:application/pdf") ? (
        <iframe title="Document" src={src} className="h-full w-full border-0" />
      ) : hasMedia && kind === "studio-document" && decodeTextDataUrl(src) != null ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <MarkdownRenderer
              content={decodeTextDataUrl(src) || ""}
              onLinkClick={onOpenUrl}
            />
          </div>
        </div>
      ) : hasMedia ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.4} />
          <p className="text-[13px] text-muted-foreground">{label} ready</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 text-[13px] font-medium hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
            Replace
          </button>
        </div>
      ) : showEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-[14px] font-medium tracking-[-0.02em]">
              Add {label}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Upload a file or generate one in chat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-foreground"
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
            Upload {label}
          </button>
        </div>
      ) : null}

      {hasMedia && (kind === "studio-image" || kind === "studio-video") ? (
        <div className="absolute right-3 bottom-3 z-20 flex items-center gap-1.5">
          <button
            type="button"
            disabled={saving || canvasBusy}
            onClick={downloadCurrent}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-background/90 px-2.5 text-[12px] font-medium backdrop-blur hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3 w-3" strokeWidth={1.6} />
            Download
          </button>
          <button
            type="button"
            disabled={canvasBusy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-background/90 px-2.5 text-[12px] font-medium backdrop-blur hover:bg-muted disabled:opacity-50"
          >
            <Upload className="h-3 w-3" strokeWidth={1.6} />
            Replace
          </button>
          <button
            type="button"
            disabled={canvasBusy}
            onClick={() => {
              setError(null);
              setNaturalRatio({ w: 1, h: 1 });
              onSrcChange("about:blank");
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-background/90 px-2.5 text-[12px] font-medium backdrop-blur hover:bg-muted disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.6} />
            Remove
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="absolute bottom-3 left-3 z-20 max-w-[min(20rem,calc(100%-11rem))] rounded-[10px] border border-border bg-background/95 px-2.5 py-1.5 text-[12px] text-destructive shadow-sm">
          {error}
        </p>
      ) : null}
    </div>
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
  if (tab.kind === "studio-image") {
    return <Image className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={1.6} />;
  }
  if (tab.kind === "studio-video") {
    return <Video className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={1.6} />;
  }
  if (tab.kind === "studio-document") {
    return <FileText className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={1.6} />;
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
          "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-muted-foreground transition-colors duration-200 hover:bg-black/[0.06] dark:hover:bg-white/[0.1] hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {children}
      </button>
    </BrowserChromeTooltip>
  );
}
