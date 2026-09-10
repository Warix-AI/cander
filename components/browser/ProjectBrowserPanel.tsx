"use client";

import { MobileFloatingNav } from "@/components/shell/mobile/MobileFloatingNav";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import {
  AppWindow,
  Bot,
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
  Monitor,
  MousePointer2,
  Pencil,
  PictureInPicture2,
  Plus,
  FolderKanban,
  LoaderCircle,
  RotateCw,
  Share,
  Smartphone,
  Tablet,
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
import { canEnterBrowserPip, startBrowserPip, stopBrowserPip } from "@/lib/browser-pip";
import {
  getBrowserPipSnapshot,
  isBrowserPipTab,
  subscribeBrowserPip,
  exitBrowserPip,
} from "@/lib/browser-pip-store";
import {
  clearBrowserTabMediaPlaying,
  isBrowserTabMediaPlaying,
} from "@/lib/browser-tab-media";
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
import { openUrlInSystemBrowser } from "@/lib/open-system-browser";
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
import {
  chatAttachmentImageUrl,
  resolveChatImageUrl,
} from "@/lib/chat-attachment-image-url";
import { updateChatThreads } from "@/lib/api/chat-store";

/** Match chat card pixels — keep inline data URLs when present. */
function canvasSrcFromImageJob(job: {
  imageUrl?: string | null;
  attachmentId?: string | null;
}): string | null {
  const inline = job.imageUrl?.trim() ?? "";
  if (inline) return inline;
  if (job.attachmentId?.trim()) {
    return chatAttachmentImageUrl(job.attachmentId.trim());
  }
  return resolveChatImageUrl({
    attachmentId: job.attachmentId,
    dataUrl: job.imageUrl,
  });
}
import {
  publishMarkdownShare,
  renameMarkdownShare,
} from "@/lib/shared-markdown-client";
import {
  markdownShareUrl,
  newMarkdownShareId,
} from "@/lib/shared-markdown";
import { useSpaceMutation, useSpaceProject } from "@/lib/hooks/use-space-query";
import { useWebsiteSetupBrief } from "@/lib/hooks/use-website-setup-brief";
import { useBuildJob } from "@/lib/hooks/use-build-job";
import { usePublishStatus } from "@/lib/hooks/use-publish-status";
import {
  deleteStudioProjectAsset,
  editStudioProjectImage,
  fetchLatestStudioProjectAsset,
  isStudioAssetUrl,
  studioAspectParts,
  studioAssetIdFromClientUrl,
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
  clearProjectBrowserSession,
  getProjectBrowserSessionRevision,
  isPreviewTabKind,
  isStudioMediaTabKind,
  makeAgentBuilderTab,
  makeProjectPreviewTab,
  makeStudioMediaTab,
  makeWebTab,
  navigateProjectBrowserTab,
  repairAgentSurfaceTab,
  setProjectBrowserSession,
  stepProjectBrowserTab,
  subscribeProjectBrowserSession,
  type ProjectBrowserKey,
  type ProjectBrowserSession,
  type ProjectBrowserTab,
} from "@/lib/project-browser-session";
import { AgentBuilderPanel } from "@/components/agents/AgentBuilderPanel";
import { AgentOverviewPanel } from "@/components/agents/AgentOverviewPanel";
import {
  createProjectAgentClient,
  deleteProjectAgentClient,
  listProjectAgentsClient,
} from "@/lib/agents/client";
import { peekCachedProjectAgents } from "@/lib/agents/cache";
import { applyAgentsToBrowserSession } from "@/lib/agents/prime-browser-session";
import {
  chromeUrlForBuildProject,
  isGoogleUrl,
  isHttpUrl,
  normalizeBrowserUrl,
  previewUrlForProject,
  draftPreviewUrlForSubdomain,
  displayHostFromUrl,
  titleFromUrl,
} from "@/lib/preview-url";
import type { BuildSandboxStatus } from "@/lib/build/sandbox/constants";
import { recordBrowserVisit } from "@/lib/browser-recent-history";
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
  isStandaloneBrowserEphemeral,
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
    viewport,
    setViewport,
  } = useApp();
  const mobile = useMobileShell();
  const desktop = useDesktopShell();
  const [mobileSheet, setMobileSheet] = useState<"add" | "rename" | null>(null);
  const [closeConfirmTabId, setCloseConfirmTabId] = useState<string | null>(
    null,
  );
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

  const entity = useMemo(() => {
    if (standalone || !projectId) return null;
    return (
      getSpaceEntityStoreSnapshot().projects.find(
        (item) => item.id === projectId && item.workspaceId === workspaceId,
      ) ?? null
    );
  }, [standalone, projectId, workspaceId, entityRevision]);

  /** Prefer the project's stored space so Create/Image stays on studio sessions. */
  const browserSpaceId = (
    entity?.space === "studio" ||
    entity?.space === "build" ||
    entity?.space === "research" ||
    entity?.space === "work"
      ? entity.space
      : spaceId === "connectors"
        ? "build"
        : spaceId
  ) ?? "build";

  const key: ProjectBrowserKey | null = standalone
    ? standaloneBrowserKey(actor.id, workspaceId)
    : projectId
      ? {
          profileId: actor.id,
          workspaceId,
          spaceId: browserSpaceId,
          projectId,
        }
      : null;

  const fallback = useMemo(() => {
    if (standalone) return defaultStandaloneBrowserSession();
    if (!projectId) {
      return defaultProjectBrowserSession({
        projectId: "project",
        title: "Project",
        spaceId: browserSpaceId,
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
      spaceId: browserSpaceId,
      projectKind: entity?.kind,
    });
  }, [
    standalone,
    projectId,
    project?.name,
    entity?.title,
    entity?.publishedUrl,
    entity?.kind,
    browserSpaceId,
  ]);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const [sandboxEnvStatus, setSandboxEnvStatus] =
    useState<BuildSandboxStatus | null>(null);
  const [sandboxEnvMessage, setSandboxEnvMessage] = useState<string | null>(
    null,
  );
  const [sandboxPreviewSrc, setSandboxPreviewSrc] = useState<string | null>(
    null,
  );
  const [draftPreviewUrl, setDraftPreviewUrl] = useState<string | null>(null);
  const sandboxPreviewSrcRef = useRef<string | null>(null);
  useEffect(() => {
    sandboxPreviewSrcRef.current = sandboxPreviewSrc;
  }, [sandboxPreviewSrc]);

  // Healthy path-proxy URL → iframe src. In production this hands the iframe
  // the project's draft host (own origin: cookies, forms, routing); a mounted
  // draft-host document is kept as-is so restarts never blank the page.
  const applyPreviewSrc = useCallback(
    async (previewPath: string) => {
      if (!projectId || !ctx.workspaceId) {
        setSandboxPreviewSrc(previewPath);
        return;
      }
      const { resolveDraftIframeSrc } = await import("@/lib/build/preview/client-iframe");
      const next = await resolveDraftIframeSrc({
        previewPath,
        projectId,
        workspaceId: ctx.workspaceId,
        currentSrc: sandboxPreviewSrcRef.current,
      });
      setSandboxPreviewSrc(next);
    },
    [projectId, ctx.workspaceId],
  );

  // A probe that fails because the sandbox VM is gone (410 after a rebuild,
  // 5xx while it restarts) is not a broken draft — bring it back automatically
  // once, then fall back to the "starting" poll loop. Real errors stay errors.
  const probeRecoveryAtRef = useRef(0);
  const handleProbeFailure = useCallback(
    (probed: { ok: false; message: string; recoverable?: boolean }) => {
      const now = Date.now();
      if (
        probed.recoverable &&
        projectId &&
        ctx.workspaceId &&
        now - probeRecoveryAtRef.current > 60_000
      ) {
        probeRecoveryAtRef.current = now;
        setSandboxEnvStatus("starting");
        setSandboxEnvMessage("Preview restarting…");
        setSandboxPreviewSrc(null);
        void (async () => {
          try {
            const sandbox = await import("@/lib/api/project-sandbox-client");
            const result = await sandbox.ensureProjectSandboxClient({
              projectId,
              workspaceId: ctx.workspaceId,
              mode: "repair",
            });
            if (!result) return;
            setSandboxEnvMessage(result.message ?? result.error ?? null);
            if (
              result.status === "ready" &&
              result.hasPreviewUpstream &&
              result.previewPath
            ) {
              const { probeDraftPreviewPath } = await import(
                "@/lib/build/preview/client-health"
              );
              const again = await probeDraftPreviewPath(result.previewPath);
              if (again.ok) {
                setSandboxEnvStatus("ready");
                void applyPreviewSrc(again.previewSrc);
              } else {
                setSandboxEnvStatus("error");
                setSandboxEnvMessage(again.message);
              }
              return;
            }
            if (result.status === "error" || result.status === "unavailable") {
              setSandboxEnvStatus(result.status);
            }
            // otherwise stay "starting" — the poll loop finishes the boot.
          } catch {
            setSandboxEnvStatus("error");
            setSandboxEnvMessage(probed.message);
          }
        })();
        return;
      }
      setSandboxEnvStatus("error");
      setSandboxEnvMessage(probed.message);
      setSandboxPreviewSrc(null);
    },
    [projectId, ctx.workspaceId],
  );

  const { brief: websiteBrief, setupBlocksPreview, showSetupOverlay, refresh: refreshWebsiteBrief } =
    useWebsiteSetupBrief({
      projectId,
      workspaceId: ctx.workspaceId,
      kind: entity?.kind,
      enabled: entity?.kind === "site" || browserSpaceId === "build",
    });
  // Website Builder V2: live progress from the sandbox builder job.
  const buildJob = useBuildJob({
    projectId,
    workspaceId: ctx.workspaceId,
    enabled: entity?.kind === "site",
  });
  const publishStatus = usePublishStatus({
    projectId,
    workspaceId: ctx.workspaceId,
    enabled: entity?.kind === "site" || entity?.kind === "app" || browserSpaceId === "build",
  });
  const draftAheadOfLive = Boolean(
    publishStatus?.published && publishStatus.aheadOfLive,
  );

  // Build drafts: ensure infra/sandbox and point the pinned preview at draft--
  // (never load `{projectId}.cander.app`, which embeds the Cander login shell).
  // Skip while guided website setup is incomplete / not ready.
  useEffect(() => {
    if (
      standalone ||
      !projectId ||
      !ctx.workspaceId ||
      entity?.kind === "automation" ||
      entity?.kind === "research"
    ) {
      return;
    }
    if (setupBlocksPreview) {
      setSandboxEnvStatus(null);
      setSandboxEnvMessage(null);
      setSandboxPreviewSrc(null);
      // Keep/resolve draft host for address bar while setup/building.
      void (async () => {
        try {
          const sandbox = await import("@/lib/api/project-sandbox-client");
          const status = await sandbox.getProjectSandboxStatusClient({
            projectId,
            workspaceId: ctx.workspaceId,
          });
          const draftUrl = draftPreviewUrlForSubdomain(status?.subdomain);
          if (draftUrl) setDraftPreviewUrl(draftUrl);
        } catch {
          /* ignore */
        }
      })();
      return;
    }
    // Keep ensuring draft sandbox even after publish — preview stays on draft.
    const looksLikeBuild =
      browserSpaceId === "build" ||
      entity?.kind === "site" ||
      entity?.kind === "app" ||
      entity?.space === "build";
    if (!looksLikeBuild) return;
    let cancelled = false;
    setSandboxEnvStatus("starting");
    setSandboxEnvMessage(null);
    void (async () => {
      try {
        const infra = await import("@/lib/api/project-infra-client");
        await infra.ensureProjectInfraClient({
          projectId,
          workspaceId: ctx.workspaceId,
        });
        const sandbox = await import("@/lib/api/project-sandbox-client");
        const status = await sandbox.getProjectSandboxStatusClient({
          projectId,
          workspaceId: ctx.workspaceId,
        });
        // Errored runtimes get an escalating repair; everything else resumes.
        const result = await sandbox.ensureProjectSandboxClient({
          projectId,
          workspaceId: ctx.workspaceId,
          mode: status?.status === "error" ? "repair" : "connect",
        });
        if (cancelled) return;
        if (!result) {
          setSandboxEnvStatus("unavailable");
          setSandboxEnvMessage("Sign in required to start the build environment.");
          setSandboxPreviewSrc(null);
          setDraftPreviewUrl(null);
          return;
        }
        setSandboxEnvStatus(result.status);
        setSandboxEnvMessage(result.message ?? result.error ?? null);
        if (
          result.status === "ready" &&
          result.hasPreviewUpstream &&
          result.previewPath
        ) {
          const { probeDraftPreviewPath } = await import(
            "@/lib/build/preview/client-health"
          );
          const probed = await probeDraftPreviewPath(result.previewPath);
          if (!probed.ok) {
            handleProbeFailure(probed);
          } else {
            void applyPreviewSrc(probed.previewSrc);
          }
        } else {
          setSandboxPreviewSrc(null);
          if (result.status === "ready" && !result.hasPreviewUpstream) {
            setSandboxEnvStatus("starting");
          }
        }
        const draftUrl = draftPreviewUrlForSubdomain(result.subdomain);
        setDraftPreviewUrl(draftUrl);
        if (draftUrl && key) {
          const current = getProjectBrowserSession(key, fallback);
          const pinnedId = current.tabs.find(
            (t) => t.kind === "build-preview" && t.projectId === projectId,
          )?.id;
          if (pinnedId) {
            const nextTabs = current.tabs.map((t) =>
              t.id === pinnedId &&
              (!isHttpUrl(t.url) || t.url.includes(`${projectId}.cander.app`))
                ? {
                    ...t,
                    url: draftUrl,
                    history: [draftUrl],
                    historyIndex: 0,
                  }
                : t,
            );
            setProjectBrowserSession(key, {
              ...current,
              tabs: nextTabs,
            });
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.info("[cander:preview] start failed", err instanceof Error ? err.message : err);
        setSandboxEnvStatus("error");
        setSandboxEnvMessage("The preview didn’t start. Try again.");
        setSandboxPreviewSrc(null);
        setDraftPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per project / setup gate
  }, [standalone, projectId, ctx.workspaceId, browserSpaceId, entity?.kind, entity?.publishedUrl, setupBlocksPreview]);

  // Poll status only — never call ensure in a loop (burns sandbox_runtime concurrency).
  // Re-ensure at most once every ~30s while stuck starting so npm/next can finish.
  useEffect(() => {
    if (
      standalone ||
      !projectId ||
      !ctx.workspaceId ||
      setupBlocksPreview ||
      sandboxEnvStatus !== "starting"
    ) {
      return;
    }
    let cancelled = false;
    let recreateAttempted = false;
    let ensureAttemptedAt = 0;
    const tick = async () => {
      try {
        const sandbox = await import("@/lib/api/project-sandbox-client");
        const result = await sandbox.getProjectSandboxStatusClient({
          projectId,
          workspaceId: ctx.workspaceId,
        });
        if (cancelled || !result) return;
        setSandboxEnvMessage(result.message ?? result.error ?? null);
        if (
          result.status === "ready" &&
          result.hasPreviewUpstream &&
          result.previewPath
        ) {
          setSandboxEnvStatus("ready");
          const { probeDraftPreviewPath } = await import(
            "@/lib/build/preview/client-health"
          );
          const probed = await probeDraftPreviewPath(result.previewPath);
          if (!probed.ok) {
            handleProbeFailure(probed);
          } else {
            void applyPreviewSrc(probed.previewSrc);
          }
          const draftUrl = draftPreviewUrlForSubdomain(result.subdomain);
          setDraftPreviewUrl(draftUrl);
          return;
        }
        // Runtime reported an error while we wait — one repair pass, not a loop.
        if (
          !recreateAttempted &&
          result.draftSha &&
          result.status === "error"
        ) {
          recreateAttempted = true;
          const restarted = await sandbox.ensureProjectSandboxClient({
            projectId,
            workspaceId: ctx.workspaceId,
            mode: "repair",
          });
          if (cancelled || !restarted) return;
          setSandboxEnvMessage(restarted.message ?? restarted.error ?? null);
          if (
            restarted.status === "ready" &&
            restarted.hasPreviewUpstream &&
            restarted.previewPath
          ) {
            setSandboxEnvStatus("ready");
            const { probeDraftPreviewPath } = await import(
              "@/lib/build/preview/client-health"
            );
            const probed = await probeDraftPreviewPath(restarted.previewPath);
            if (!probed.ok) {
              handleProbeFailure(probed);
            } else {
              void applyPreviewSrc(probed.previewSrc);
            }
            setDraftPreviewUrl(
              draftPreviewUrlForSubdomain(restarted.subdomain),
            );
            return;
          }
          if (
            restarted.status === "error" ||
            restarted.status === "unavailable"
          ) {
            setSandboxEnvStatus(restarted.status);
            setSandboxPreviewSrc(null);
          }
          return;
        }
        // Soft-fail / timed-out ensure left us on "starting" with no live port —
        // retry ensure occasionally (not every poll) so next can finish booting.
        const now = Date.now();
        if (
          (result.status === "starting" ||
            result.status === "idle" ||
            !result.sessionId) &&
          now - ensureAttemptedAt > 30_000
        ) {
          ensureAttemptedAt = now;
          const resumed = await sandbox.ensureProjectSandboxClient({
            projectId,
            workspaceId: ctx.workspaceId,
            mode: "connect",
          });
          if (cancelled || !resumed) return;
          setSandboxEnvMessage(resumed.message ?? resumed.error ?? null);
          if (
            resumed.status === "ready" &&
            resumed.hasPreviewUpstream &&
            resumed.previewPath
          ) {
            setSandboxEnvStatus("ready");
            const { probeDraftPreviewPath } = await import(
              "@/lib/build/preview/client-health"
            );
            const probed = await probeDraftPreviewPath(resumed.previewPath);
            if (!probed.ok) {
              handleProbeFailure(probed);
            } else {
              void applyPreviewSrc(probed.previewSrc);
            }
            setDraftPreviewUrl(draftPreviewUrlForSubdomain(resumed.subdomain));
            return;
          }
          if (resumed.status === "error" || resumed.status === "unavailable") {
            setSandboxEnvStatus(resumed.status);
            setSandboxPreviewSrc(null);
            return;
          }
        }
        if (result.status === "error" || result.status === "unavailable") {
          setSandboxEnvStatus(result.status);
          setSandboxPreviewSrc(null);
        }
      } catch {
        /* keep polling status */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    standalone,
    projectId,
    ctx.workspaceId,
    setupBlocksPreview,
    sandboxEnvStatus,
  ]);

  // Instant draft preview after guided website build completes.
  useEffect(() => {
    if (standalone || !projectId || !ctx.workspaceId) return;
    const onReload = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { projectId?: string }
        | undefined;
      if (detail?.projectId && detail.projectId !== projectId) return;
      setSandboxEnvStatus("starting");
      void (async () => {
        try {
          const sandbox = await import("@/lib/api/project-sandbox-client");
          const result = await sandbox.ensureProjectSandboxClient({
            projectId,
            workspaceId: ctx.workspaceId,
          });
          if (!result) {
            setSandboxEnvStatus("unavailable");
            return;
          }
          setSandboxEnvStatus(result.status);
          setSandboxEnvMessage(result.message ?? result.error ?? null);
          if (
            result.status === "ready" &&
            result.hasPreviewUpstream &&
            result.previewPath
          ) {
            const { probeDraftPreviewPath } = await import(
              "@/lib/build/preview/client-health"
            );
            const probed = await probeDraftPreviewPath(result.previewPath);
            if (!probed.ok) {
              handleProbeFailure(probed);
            } else {
              await applyPreviewSrc(probed.previewSrc);
              // Edits landed: refresh the page the user is on, in place.
              const { reloadDraftPreview } = await import("@/lib/build/preview/client-iframe");
              reloadDraftPreview();
            }
          } else {
            setSandboxPreviewSrc(null);
            if (result.status === "ready" && !result.hasPreviewUpstream) {
              setSandboxEnvStatus("starting");
            }
          }
          const draftUrl = draftPreviewUrlForSubdomain(result.subdomain);
          setDraftPreviewUrl(draftUrl);
        } catch (err) {
          console.info("[cander:preview] reload failed", err instanceof Error ? err.message : err);
          setSandboxEnvStatus("error");
          setSandboxEnvMessage("The preview didn’t start. Try again.");
        }
      })();
    };
    window.addEventListener("cander:website-preview-reload", onReload);
    window.addEventListener("cander:website-setup-ready", onReload);
    return () => {
      window.removeEventListener("cander:website-preview-reload", onReload);
      window.removeEventListener("cander:website-setup-ready", onReload);
    };
  }, [standalone, projectId, ctx.workspaceId, applyPreviewSrc, handleProbeFailure]);

  const session =
    hydrated && key
      ? standalone
        ? getStandaloneBrowserSession(key, fallback)
        : getProjectBrowserSession(key, fallback)
      : fallback;

  // Search projects are browser-only. Remove legacy pinned project tabs so the
  // first tab is always a closable blank browser tab.
  useEffect(() => {
    if (!key || standalone || spaceId !== "research") return;
    if (session.tabs.some((tab) => tab.kind !== "web")) {
      clearProjectBrowserSession(key);
    }
  }, [key, session, spaceId, standalone]);

  // Keep agent-builder tabs in sync with project_agents (one tab per agent).
  // Do not depend on sessionRevision — that re-fetched on every tab write.
  useEffect(() => {
    if (!key || standalone || !entity || entity.kind !== "automation") return;
    const current = getProjectBrowserSession(key, fallback);
    const repairedTabs = current.tabs.map(repairAgentSurfaceTab);
    const needsRepair = repairedTabs.some(
      (tab, i) =>
        tab.kind !== current.tabs[i]!.kind ||
        tab.agentId !== current.tabs[i]!.agentId,
    );
    if (needsRepair) {
      setProjectBrowserSession(key, {
        ...current,
        tabs: repairedTabs,
      });
      return;
    }
    if (
      current.tabs.some((tab) => tab.kind === "agent-overview") &&
      !current.tabs.some((tab) => tab.kind === "agent-builder")
    ) {
      return;
    }

    const hasBoundAgents = current.tabs.some(
      (tab) => tab.kind === "agent-builder" && tab.agentId,
    );
    if (hasBoundAgents) return;

    // Prefer cache so the first paint after open isn't a blank wait.
    const cached = peekCachedProjectAgents(workspaceId, entity.id);
    if (cached?.length) {
      applyAgentsToBrowserSession({
        key,
        projectId: entity.id,
        title: entity.title,
        agents: cached,
      });
      return;
    }

    let cancelled = false;
    void listProjectAgentsClient({
      workspaceId,
      projectId: entity.id,
    })
      .then((agents) => {
        if (cancelled || !agents.length) return;
        applyAgentsToBrowserSession({
          key,
          projectId: entity.id,
          title: entity.title,
          agents,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    key,
    standalone,
    entity?.id,
    entity?.kind,
    entity?.title,
    workspaceId,
    fallback,
  ]);

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
    if (!key) return;
    const current = standalone
      ? getStandaloneBrowserSession(key, session)
      : getProjectBrowserSession(key, session);
    if (id === current.activeTabId) return;
    const leaving =
      current.tabs.find((item) => item.id === current.activeTabId) ?? null;
    const adapter = getBrowserSurfaceAdapter();
    const pip = getBrowserPipSnapshot();

    // Clicking the tab that is already in PiP restores it into the panel.
    if (pip?.tabId === id) {
      void (async () => {
        exitBrowserPip();
        if (!pip.webEmbed) {
          await adapter.setPipTab?.(null);
        }
        const latest = standalone
          ? getStandaloneBrowserSession(key, current)
          : getProjectBrowserSession(key, current);
        write({ ...latest, activeTabId: id });
      })();
      return;
    }

    // Leaving a web tab — float PiP if media was playing (sticky + live check).
    if (
      leaving?.kind === "web" &&
      leaving.id !== id &&
      !isBrowserPipTab(leaving.id)
    ) {
      void (async () => {
        let playing = isBrowserTabMediaPlaying(leaving.id);
        if (!playing && typeof adapter.hasPlayingVideo === "function") {
          try {
            playing = await adapter.hasPlayingVideo(leaving.id);
          } catch {
            playing = false;
          }
        }
        if (playing) {
          await startBrowserPip({
            tabId: leaving.id,
            url: leaving.url || "",
            title: leaving.title || "Browser",
            faviconUrl: leaving.faviconUrl ?? null,
            userId: actor.id,
            sourceProjectId: projectId ?? null,
          });
        }
        const latest = standalone
          ? getStandaloneBrowserSession(key, current)
          : getProjectBrowserSession(key, current);
        write({ ...latest, activeTabId: id });
      })();
      return;
    }

    write({ ...current, activeTabId: id });
  };

  const closeTab = (id: string) => {
    const tab = session.tabs.find((item) => item.id === id);
    if (!tab || tab.pinned) return;

    if (tab.kind === "agent-builder") {
      const agentTabs = session.tabs.filter(
        (item) => item.kind === "agent-builder",
      );
      if (agentTabs.length <= 1) return;
      if (!window.confirm(`Delete agent “${tab.title}”?`)) return;
      const agentId = tab.agentId;
      const tabs = session.tabs.filter((item) => item.id !== id);
      const activeTabId =
        session.activeTabId === id
          ? (tabs[0]?.id ?? session.activeTabId)
          : session.activeTabId;
      write({ tabs, activeTabId });
      if (agentId && projectId) {
        void deleteProjectAgentClient({
          workspaceId,
          projectId,
          agentId,
        }).catch(() => {});
      }
      return;
    }

    const adapter = getBrowserSurfaceAdapter();
    const pip = getBrowserPipSnapshot();

    // Closing the PiP source tab — dismiss PiP and destroy.
    if (pip && pip.tabId === id) {
      void stopBrowserPip({ destroy: true });
    } else if (tab.kind === "web" && adapter.id !== "web-pwa") {
      clearBrowserTabMediaPlaying(id);
      void adapter.destroyTab(id);
    }

    if (session.tabs.length <= 1) {
      if (standalone) {
        // Ephemeral chat/quick-search browser: closing the last tab leaves panel.
        if (isStandaloneBrowserEphemeral()) {
          closeStandaloneBrowser();
          return;
        }
        const blank = makeWebTab();
        write({ tabs: [blank], activeTabId: blank.id });
      } else if (key) {
        clearProjectBrowserSession(key);
        backToSpaceHome();
      }
      return;
    }

    const tabs = session.tabs.filter((item) => item.id !== id);
    if (!tabs.length) return;
    let activeTabId =
      session.activeTabId === id
        ? (tabs[0]?.id ?? session.activeTabId)
        : session.activeTabId;

    // Only the PiP source tab remains (or becomes active) → restore into panel.
    const pipStill =
      pip && pip.tabId !== id ? pip : getBrowserPipSnapshot();
    if (
      pipStill &&
      tabs.some((item) => item.id === pipStill.tabId) &&
      (tabs.length === 1 || activeTabId === pipStill.tabId)
    ) {
      activeTabId = pipStill.tabId;
      void (async () => {
        exitBrowserPip();
        if (!pipStill.webEmbed) {
          await adapter.setPipTab?.(null);
        }
        write({ tabs, activeTabId });
      })();
      return;
    }

    write({ tabs, activeTabId });
  };

  const requestCloseTab = (id: string) => {
    const tab = session.tabs.find((item) => item.id === id);
    if (
      mobile &&
      (tab?.kind === "studio-image" ||
        (spaceId === "research" && tab?.kind === "web"))
    ) {
      setCloseConfirmTabId(id);
      return;
    }
    closeTab(id);
  };

  const closeConfirmTab =
    closeConfirmTabId == null
      ? null
      : (session.tabs.find((item) => item.id === closeConfirmTabId) ?? null);
  const closeConfirmIsImage = closeConfirmTab?.kind === "studio-image";
  const closeConfirmLabel = (() => {
    if (!closeConfirmTab) return "Tab";
    if (closeConfirmTab.kind === "studio-image") {
      const studioIndex = session.tabs
        .filter((item) => item.kind === "studio-image")
        .findIndex((item) => item.id === closeConfirmTab.id);
      return studioIndex >= 0
        ? studioImageTabLabel(studioIndex)
        : closeConfirmTab.title || "Image";
    }
    if (closeConfirmTab.kind === "web") {
      return (
        closeConfirmTab.title ||
        displayHostFromUrl(closeConfirmTab.url) ||
        "Website"
      );
    }
    return closeConfirmTab.title || "Tab";
  })();

  const addAgentTab = () => {
    if (!projectId || !key) return;
    void createProjectAgentClient({
      workspaceId,
      projectId,
      name: `Agent ${session.tabs.filter((t) => t.kind === "agent-builder").length + 1}`,
    })
      .then((agent) => {
        const tab = makeAgentBuilderTab({
          projectId,
          title: agent.name,
          agentId: agent.id,
        });
        const current = getProjectBrowserSession(key, fallback);
        setProjectBrowserSession(key, {
          tabs: [
            ...current.tabs.filter((t) => t.kind === "agent-builder"),
            tab,
            ...current.tabs.filter((t) => t.kind !== "agent-builder"),
          ],
          activeTabId: tab.id,
        });
      })
      .catch(() => {});
  };

  const addUrlTab = (url?: string) => {
    const leaving = active;
    const tab = makeWebTab();
    const next = url && url !== "about:blank"
      ? navigateProjectBrowserTab(tab, normalizeBrowserUrl(url))
      : tab;
    const commit = () =>
      write({
        tabs: [...session.tabs, next],
        activeTabId: next.id,
      });

    if (leaving?.kind === "web" && !isBrowserPipTab(leaving.id)) {
      void (async () => {
        let playing = isBrowserTabMediaPlaying(leaving.id);
        if (!playing) {
          const adapter = getBrowserSurfaceAdapter();
          if (typeof adapter.hasPlayingVideo === "function") {
            try {
              playing = await adapter.hasPlayingVideo(leaving.id);
            } catch {
              playing = false;
            }
          }
        }
        if (playing) {
          await startBrowserPip({
            tabId: leaving.id,
            url: leaving.url || "",
            title: leaving.title || "Browser",
            faviconUrl: leaving.faviconUrl ?? null,
            userId: actor.id,
            sourceProjectId: projectId ?? null,
          });
        }
        commit();
      })();
      return;
    }

    commit();
  };

  const addStudioMediaTab = (
    kind: "studio-image" | "studio-document",
  ) => {
    const existingImages = session.tabs.filter(
      (tab) => tab.kind === "studio-image",
    ).length;
    const title =
      kind === "studio-image" && existingImages > 0
        ? `Image ${existingImages + 1}`
        : undefined;
    const tab: ProjectBrowserTab = {
      ...makeStudioMediaTab(kind, title),
      ...(kind === "studio-image" ? { studioFresh: true } : {}),
    };
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
    if (url !== "about:blank") {
      recordBrowserVisit({ url, title: titleFromUrl(url) });
    }
  };

  const navigateAddressTo = (raw: string) => {
    const url = normalizeBrowserUrl(raw);
    setUrlDraft(url === "about:blank" ? "" : url);
    write({
      ...session,
      tabs: session.tabs.map((tab) =>
        tab.id === active.id ? navigateProjectBrowserTab(tab, url) : tab,
      ),
    });
    if (url !== "about:blank") {
      recordBrowserVisit({ url, title: titleFromUrl(url) });
    }
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
  const navigationUrl =
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
  // Site/app drafts: show draft-- host in chrome (published preferred when set).
  const isBuildSiteOrApp =
    !standalone &&
    (entity?.kind === "site" ||
      entity?.kind === "app" ||
      browserSpaceId === "build");
  // Floating tab bar covers the draft on mobile — hide it inside website/app projects.
  const showMobileTabBar =
    mobile &&
    !isBuildSiteOrApp &&
    session.tabs.length > 0 &&
    (session.tabs.length > 1 || spaceId === "research" || standalone);
  // Mobile website/app: always the draft surface (no live-domain address bar / web tab).
  useEffect(() => {
    if (!mobile || !isBuildSiteOrApp || !key) return;
    const draft = session.tabs.find(
      (tab) => tab.kind === "build-preview" || tab.kind === "project-preview",
    );
    if (!draft || session.activeTabId === draft.id) return;
    write({
      tabs: session.tabs,
      activeTabId: draft.id,
    });
  }, [mobile, isBuildSiteOrApp, key, session.activeTabId, session.tabs, write]);
  const address =
    active.kind === "studio-document" || active.kind === "agent-browser"
      ? navigationUrl
      : isBuildSiteOrApp && active.kind !== "web"
        ? chromeUrlForBuildProject({
            publishedUrl: entity?.publishedUrl,
            candidateUrl:
              draftPreviewUrl || navigationUrl || sandboxPreviewSrc || "",
          })
        : navigationUrl;
  const isMarkdownDocTab =
    active.kind === "studio-document" &&
    decodeTextDataUrl(active.url) != null;

  const researchBrowserActionsRef = useRef({
    onCopyLink: () => {},
    onOpenNewTab: () => {},
    onOpenSystemBrowser: () => {},
    onClearPage: () => {},
    address: "about:blank" as string,
  });
  researchBrowserActionsRef.current = {
    address,
    onCopyLink: async () => {
      try {
        await navigator.clipboard.writeText(address);
      } catch {
        window.prompt("Copy page address", address);
      }
    },
    onOpenNewTab: () => addUrlTab(active.url || "about:blank"),
    onOpenSystemBrowser: () => {
      void openUrlInSystemBrowser(active.url || address);
    },
    onClearPage: () => navigateAddressTo("about:blank"),
  };

  useEffect(() => {
    if (!mobile || browserSpaceId !== "research" || standalone) {
      window.dispatchEvent(
        new CustomEvent("mobile-research-browser-actions", { detail: null }),
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent("mobile-research-browser-actions", {
        detail: {
          address: researchBrowserActionsRef.current.address,
          onCopyLink: () =>
            void researchBrowserActionsRef.current.onCopyLink(),
          onOpenNewTab: () =>
            researchBrowserActionsRef.current.onOpenNewTab(),
          onOpenSystemBrowser: () =>
            researchBrowserActionsRef.current.onOpenSystemBrowser(),
          onClearPage: () => researchBrowserActionsRef.current.onClearPage(),
        },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("mobile-research-browser-actions", { detail: null }),
      );
    };
  }, [mobile, browserSpaceId, standalone, address, active.id]);

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
  const previewFallbackSummary = isBuildSiteOrApp
    ? "Start generating your website in chat."
    : (workItem?.summary ?? project?.summary ?? "");
  const canRename =
    !standalone &&
    !isWorkItemBrowserProjectId(projectId) &&
    (spaceId === "build" || spaceId === "research" || spaceId === "studio");
  /** Work space items hide URL/nav chrome until the user adds a browser tab. */
  const isWorkItemBrowser =
    !standalone && spaceId === "work" && isWorkItemBrowserProjectId(projectId);
  const isStudioProject =
    !standalone &&
    (browserSpaceId === "studio" ||
      project?.space === "studio" ||
      entity?.space === "studio");
  const isAgentProject = !standalone && entity?.kind === "automation";
  const repairedActive = active ? repairAgentSurfaceTab(active) : null;
  const isAgentSurfaceTab =
    repairedActive?.kind === "agent-builder" ||
    repairedActive?.kind === "agent-overview";
  // Build site/app: the draft tab keeps its compact controls on the tab row;
  // any other web tab (the published site, a reference page) behaves like a
  // normal browser tab with the address bar, back/forward and reload.
  const isBuildDraftTab =
    isBuildSiteOrApp &&
    (active?.kind === "build-preview" || active?.kind === "project-preview");
  const showBrowserNavChrome = isBuildSiteOrApp
    ? // Mobile stays on the draft tab only — no live-site address chrome.
      mobile
      ? false
      : active?.kind === "web"
    : isAgentSurfaceTab || isAgentProject
      ? active?.kind === "web" && !isAgentSurfaceTab
      : isMarkdownDocTab
        ? true
        : isStudioProject
          ? active?.kind === "web"
          : !isWorkItemBrowser || session.tabs.some((tab) => tab.kind === "web");

  const pipGate = canEnterBrowserPip(
    active?.kind === "web" ? address || active.url || "" : "",
  );
  const pipForActive = useSyncExternalStore(
    subscribeBrowserPip,
    () => (active ? isBrowserPipTab(active.id) : false),
    () => false,
  );

  const enterPipForActive = async () => {
    if (!active || active.kind !== "web") return false;
    const url = address || active.url || "";
    return startBrowserPip({
      tabId: active.id,
      url,
      title: active.title || projectTitle,
      faviconUrl: active.faviconUrl ?? null,
      userId: actor.id,
      sourceProjectId: projectId ?? null,
      webEmbed: pipGate.webEmbed,
    });
  };

  const leaveProject = async () => {
    backToSpaceHome();
  };

  // Panel covered / left Explore while media plays → float as app-wide PiP.
  useEffect(() => {
    if (surfaceActive) return;
    if (!active || active.kind !== "web") return;
    if (isBrowserPipTab(active.id)) return;
    let cancelled = false;
    void (async () => {
      const adapter = getBrowserSurfaceAdapter();
      let playing = isBrowserTabMediaPlaying(active.id);
      if (!playing && typeof adapter.hasPlayingVideo === "function") {
        playing = await adapter.hasPlayingVideo(active.id);
      }
      if (cancelled || !playing) return;
      await startBrowserPip({
        tabId: active.id,
        url: address || active.url || "",
        title: active.title || projectTitle,
        faviconUrl: active.faviconUrl ?? null,
        userId: actor.id,
        sourceProjectId: projectId ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [surfaceActive, active?.id, active?.kind]);

  // Returning to a project whose active tab is already the PiP source → restore
  // into the panel. Do NOT depend on pipForActive: entering PiP while still on
  // that tab (before selectTab commits the next tab) must not immediately dismiss.
  useEffect(() => {
    if (!surfaceActive) return;
    if (!active || active.kind !== "web") return;
    if (!isBrowserPipTab(active.id)) return;
    let cancelled = false;
    void (async () => {
      const pip = getBrowserPipSnapshot();
      if (!pip || pip.tabId !== active.id || cancelled) return;
      exitBrowserPip();
      if (!pip.webEmbed) {
        await getBrowserSurfaceAdapter().setPipTab?.(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surfaceActive, active?.id]);

  // Leaving this browser session — promote playing tabs to PiP, destroy the rest.
  useEffect(() => {
    if (!key) return;
    const sessionKey = key;
    const isStandalone = standalone;
    const leaveUserId = actor.id;
    const leaveProjectId = projectId ?? null;
    return () => {
      const adapter = getBrowserSurfaceAdapter();
      if (adapter.id === "web-pwa") return;
      const pipId = getBrowserPipSnapshot()?.tabId ?? null;
      const current = isStandalone
        ? getStandaloneBrowserSession(sessionKey, defaultStandaloneBrowserSession())
        : getProjectBrowserSession(
            sessionKey,
            defaultProjectBrowserSession({
              projectId: sessionKey.projectId,
              title: "Project",
              spaceId: sessionKey.spaceId,
            }),
          );
      for (const tab of current.tabs) {
        if (tab.kind !== "web") continue;
        if (tab.id === pipId) continue;
        if (isBrowserTabMediaPlaying(tab.id)) {
          void startBrowserPip({
            tabId: tab.id,
            url: tab.url || "",
            title: tab.title || "Browser",
            faviconUrl: tab.faviconUrl ?? null,
            userId: leaveUserId,
            sourceProjectId: leaveProjectId,
          });
          continue;
        }
        clearBrowserTabMediaPlaying(tab.id);
        void adapter.destroyTab(tab.id);
      }
    };
  }, [key?.profileId, key?.workspaceId, key?.spaceId, key?.projectId, standalone]);

  const studioImageJobs = useMemo(() => {
    if (!thread) return [];
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
  }, [thread]);

  /** Stream path: model is creating an image before an image_generation block exists. */
  const chatCreatingImage = useMemo(() => {
    if (!thread) return false;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const message = thread.messages[i]!;
      if (message.role !== "assistant") continue;
      if (message.status !== "pending" && message.status !== "streaming") {
        break;
      }
      if (
        (message.blocks ?? []).some(
          (block) =>
            block.type === "image_generation" &&
            block.status === "generating",
        )
      ) {
        return true;
      }
      const detail = message.activity?.detail?.trim().toLowerCase() ?? "";
      if (
        detail.includes("creating your image") ||
        detail.includes("generating your image") ||
        detail.includes("generating image")
      ) {
        return true;
      }
      break;
    }
    return false;
  }, [thread]);

  const latestChatImageSrc = useMemo(() => {
    if (!thread) return null as string | null;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const message = thread.messages[i]!;
      for (let j = (message.blocks?.length ?? 0) - 1; j >= 0; j--) {
        const block = message.blocks![j]!;
        if (block.type === "image" && block.url?.trim()) {
          return block.url.trim();
        }
      }
    }
    return null;
  }, [thread]);

  const studioImageJobsSig = studioImageJobs
    .map(
      (job) =>
        `${job.generationId}:${job.status}:${job.imageUrl?.trim() ?? ""}:${job.attachmentId?.trim() ?? ""}`,
    )
    .join("|");

  const activeStudioChatImage = useMemo(() => {
    if (!studioImageJobs.length) {
      return {
        src: latestChatImageSrc,
        generating: chatCreatingImage,
      };
    }
    const boundId = active?.boundGenerationId?.trim();
    const boundJob = boundId
      ? studioImageJobs.find((job) => job.generationId === boundId)
      : undefined;
    const preferred = boundJob ?? studioImageJobs[studioImageJobs.length - 1]!;
    const generating =
      preferred.status === "generating" ||
      (chatCreatingImage && preferred.status !== "completed");
    let src =
      preferred.status === "completed"
        ? canvasSrcFromImageJob(preferred)
        : null;
    if (!src) {
      for (let i = studioImageJobs.length - 1; i >= 0; i--) {
        const job = studioImageJobs[i]!;
        if (job.status !== "completed") continue;
        src = canvasSrcFromImageJob(job);
        if (src) break;
      }
    }
    return { src: src ?? latestChatImageSrc, generating };
  }, [
    studioImageJobs,
    active?.boundGenerationId,
    studioImageJobsSig,
    chatCreatingImage,
    latestChatImageSrc,
  ]);

  const tabGeneratingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of session.tabs) {
      if (tab.kind !== "studio-image" || tab.studioCleared) continue;
      const boundId = tab.boundGenerationId?.trim();
      if (boundId) {
        const job = studioImageJobs.find((row) => row.generationId === boundId);
        if (job?.status === "generating") {
          ids.add(tab.id);
          continue;
        }
      }
      const empty =
        !tab.url || tab.url === "" || tab.url === "about:blank";
      if (
        chatCreatingImage &&
        empty &&
        !boundId &&
        (tab.id === session.activeTabId ||
          tab.studioFresh ||
          !session.tabs.some(
            (other) =>
              other.kind === "studio-image" &&
              other.boundGenerationId &&
              studioImageJobs.some(
                (job) =>
                  job.generationId === other.boundGenerationId &&
                  job.status === "generating",
              ),
          ))
      ) {
        ids.add(tab.id);
      }
    }
    return ids;
  }, [
    session.tabs,
    session.activeTabId,
    studioImageJobs,
    chatCreatingImage,
  ]);

  // Every chat image generation gets its own Studio canvas tab.
  // Do NOT re-steal focus while another canvas generates.
  useEffect(() => {
    if (!key || !studioImageJobs.length) return;
    const hasStudioImageTab = session.tabs.some(
      (tab) => tab.kind === "studio-image",
    );
    if (!isStudioProject && !hasStudioImageTab) return;

    const isEmptyUnboundStudioTab = (tab: ProjectBrowserTab) =>
      tab.kind === "studio-image" &&
      !tab.boundGenerationId &&
      !tab.studioCleared &&
      (!tab.url || tab.url === "" || tab.url === "about:blank");

    const current = getProjectBrowserSession(key, session);
    let nextTabs = current.tabs.slice();
    let changed = false;
    let focusTabId: string | null = null;

    // Drop stale binds that no longer exist in this thread so fallbacks work.
    const liveIds = new Set(
      studioImageJobs.map((job) => job.generationId.trim()),
    );
    nextTabs = nextTabs.map((tab) => {
      if (
        tab.kind === "studio-image" &&
        tab.boundGenerationId &&
        !liveIds.has(tab.boundGenerationId)
      ) {
        changed = true;
        return { ...tab, boundGenerationId: undefined };
      }
      return tab;
    });

    const preferEmptyUnboundIndex = (jobIndex: number) => {
      const activeIdx = nextTabs.findIndex(
        (tab) =>
          tab.id === current.activeTabId && isEmptyUnboundStudioTab(tab),
      );
      if (activeIdx >= 0) return activeIdx;
      // First generation belongs on the original first Image tab when empty.
      if (jobIndex === 0) {
        const firstStudio = nextTabs.findIndex(
          (tab) => tab.kind === "studio-image",
        );
        if (
          firstStudio >= 0 &&
          isEmptyUnboundStudioTab(nextTabs[firstStudio]!)
        ) {
          return firstStudio;
        }
      }
      // Prefer an intentional + Image tab over an older empty canvas.
      const freshIdx = nextTabs.findIndex(
        (tab) => isEmptyUnboundStudioTab(tab) && tab.studioFresh,
      );
      if (freshIdx >= 0) return freshIdx;
      return nextTabs.findIndex(isEmptyUnboundStudioTab);
    };

    studioImageJobs.forEach((job, index) => {
      const genId = job.generationId.trim();
      let targetIndex = nextTabs.findIndex(
        (tab) =>
          tab.kind === "studio-image" && tab.boundGenerationId === genId,
      );
      let newlyBound = false;

      const labelForTarget = (tabIndex: number) => {
        const studioOrdinal = nextTabs
          .filter((tab) => tab.kind === "studio-image")
          .findIndex((tab) => tab.id === nextTabs[tabIndex]?.id);
        return studioImageTabLabel(studioOrdinal >= 0 ? studioOrdinal : index);
      };

      const maybeRetitle = (tab: ProjectBrowserTab, tabIndex: number) => {
        if (
          tab.title === "Canvas" ||
          tab.title === "Document" ||
          tab.title === "Image" ||
          /^Image \d+$/.test(tab.title)
        ) {
          return labelForTarget(tabIndex);
        }
        return tab.title;
      };

      if (targetIndex < 0) {
        const seedUrl =
          resolveChatImageUrl({
            attachmentId: job.attachmentId,
            dataUrl: job.imageUrl,
          }) ||
          canvasSrcFromImageJob(job) ||
          "";
        const imageUrl = job.imageUrl?.trim() ?? "";
        const matchByUrl =
          seedUrl.length > 0
            ? nextTabs.findIndex(
                (tab) =>
                  tab.kind === "studio-image" &&
                  !tab.boundGenerationId &&
                  (tab.url?.trim() === seedUrl || tab.url?.trim() === imageUrl),
              )
            : -1;
        if (matchByUrl >= 0) {
          const matched = nextTabs[matchByUrl]!;
          nextTabs[matchByUrl] = {
            ...matched,
            boundGenerationId: genId,
            studioFresh: undefined,
            title: maybeRetitle(matched, matchByUrl),
          };
          targetIndex = matchByUrl;
          newlyBound = true;
          changed = true;
        } else {
          const emptyIndex = preferEmptyUnboundIndex(index);
          if (emptyIndex >= 0) {
            const empty = nextTabs[emptyIndex]!;
            nextTabs[emptyIndex] = {
              ...empty,
              boundGenerationId: genId,
              studioFresh: undefined,
              title: maybeRetitle(empty, emptyIndex),
            };
            targetIndex = emptyIndex;
            newlyBound = true;
            changed = true;
            if (job.status === "generating") {
              focusTabId = empty.id;
            }
          } else {
            const tab: ProjectBrowserTab = {
              ...makeStudioMediaTab(
                "studio-image",
                studioImageTabLabel(
                  nextTabs.filter((row) => row.kind === "studio-image").length,
                ),
              ),
              boundGenerationId: genId,
            };
            nextTabs = [...nextTabs, tab];
            targetIndex = nextTabs.length - 1;
            newlyBound = true;
            changed = true;
            if (job.status === "generating") {
              focusTabId = tab.id;
            }
          }
        }
        if (newlyBound && job.status === "generating" && focusTabId == null) {
          focusTabId = nextTabs[targetIndex]?.id ?? null;
        }
      }

      const target = nextTabs[targetIndex];
      if (!target) return;

      const imageUrl = job.imageUrl?.trim();
      const seedUrl =
        resolveChatImageUrl({
          attachmentId: job.attachmentId,
          dataUrl: job.imageUrl,
        }) || canvasSrcFromImageJob(job);
      if (job.status === "completed" && seedUrl) {
        const existingUrl = target.url?.trim() ?? "";
        const hasCanvas =
          existingUrl.length > 0 && existingUrl !== "about:blank";
        const sameImage =
          existingUrl === seedUrl || existingUrl === imageUrl;
        const shouldSeed =
          !target.studioCleared &&
          (!hasCanvas ||
            (!sameImage && !isStudioAssetUrl(existingUrl)) ||
            (existingUrl.startsWith("data:") &&
              seedUrl !== existingUrl &&
              !seedUrl.startsWith("data:")));
        if (shouldSeed) {
          nextTabs[targetIndex] = {
            ...target,
            boundGenerationId: genId,
            studioCleared: undefined,
            studioFresh: undefined,
            url: seedUrl,
            faviconUrl: seedUrl,
            history: [seedUrl],
            historyIndex: 0,
            title: maybeRetitle(target, targetIndex),
          };
          changed = true;
        } else {
          const favicon =
            target.faviconUrl?.trim() ||
            (hasCanvas ? existingUrl : "") ||
            seedUrl;
          const needsFavicon =
            Boolean(favicon) &&
            favicon !== "about:blank" &&
            target.faviconUrl !== favicon;
          if (
            (target.boundGenerationId !== genId && !target.studioCleared) ||
            needsFavicon
          ) {
            nextTabs[targetIndex] = {
              ...target,
              boundGenerationId: genId,
              studioFresh: undefined,
              ...(needsFavicon ? { faviconUrl: favicon } : {}),
            };
            changed = true;
          }
        }
      } else if (target.boundGenerationId !== genId && !target.studioCleared) {
        nextTabs[targetIndex] = {
          ...target,
          boundGenerationId: genId,
          studioFresh: undefined,
        };
        changed = true;
      }
    });

    // Never steal focus on URL/favicon sync — only when binding a generating job.
    const latest = getProjectBrowserSession(key, current);
    const activeTabId = focusTabId ?? latest.activeTabId;
    if (!changed && activeTabId === latest.activeTabId) return;
    write({ tabs: nextTabs, activeTabId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on job set + browser key
  }, [
    isStudioProject,
    key?.projectId,
    key?.spaceId,
    key?.workspaceId,
    key?.profileId,
    studioImageJobsSig,
  ]);

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
        : navigationUrl || address;
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
    navigationUrl,
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
        mobile ? "bg-white dark:bg-black" : BROWSER_CHROME_BG,
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
              generatingTabIds={tabGeneratingIds}
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
                className="pointer-events-auto"
                url={address}
                faviconUrl={active.faviconUrl}
                draft={urlDraft === "about:blank" ? "" : urlDraft}
                onDraftChange={setUrlDraft}
                onCommit={commitUrl}
                onNavigateTo={navigateAddressTo}
                showFavicon={false}
                placeholder={
                  isBuildSiteOrApp && !entity?.publishedUrl
                    ? "Not published yet"
                    : "Search"
                }
                autoEditKey={
                  active.kind === "web" &&
                  (address === "about:blank" || active.url === "about:blank")
                    ? active.id
                    : null
                }
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
            onAddAgent={isAgentProject ? addAgentTab : undefined}
            extraProjects={extraProjects}
            studioMode={isStudioProject}
            agentMode={isAgentProject}
            generatingTabIds={tabGeneratingIds}
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
            {isBuildDraftTab ? (
              <DesktopProjectToolsMenu
                canRename={canRename}
                publishLabel={draftAheadOfLive ? "Republish" : "Publish"}
                viewport={viewport}
                onCycleViewport={() => setViewport(VIEWPORT_CYCLE[viewport].next)}
                onRename={() => {
                  setRenameTarget("project");
                  setDesktopRenameOpen(true);
                }}
                onPublish={() => openOverlay("publish")}
                onDomain={() => openOverlay("domains")}
                onOpenExternal={() =>
                  addUrlTab(draftPreviewUrl || navigationUrl || address)
                }
                onOpenSystemBrowser={() => {
                  void openUrlInSystemBrowser(
                    draftPreviewUrl || active.url || address,
                  );
                }}
                onRefresh={() => {
                  void import("@/lib/build/preview/client-iframe").then((m) => {
                    if (!m.reloadDraftPreview()) {
                      refreshPreview();
                      runBrowserNav("reload");
                    }
                  });
                }}
              />
            ) : null}
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
              <>
                {active?.kind === "web" && !pipForActive ? (
                  <BrowserChromeTooltip
                    label={
                      pipGate.ok
                        ? "Picture in picture"
                        : (pipGate.reason ?? "Picture in picture")
                    }
                  >
                    <BrowserChromeIconButton
                      aria-label="Picture in picture"
                      disabled={!pipGate.ok}
                      onClick={() => void enterPipForActive()}
                    >
                      <PictureInPicture2
                        className="h-3.5 w-3.5"
                        strokeWidth={1.6}
                      />
                    </BrowserChromeIconButton>
                  </BrowserChromeTooltip>
                ) : null}
                <BrowserChromeTooltip label="Leave project">
                  <BrowserChromeIconButton
                    aria-label="Leave project"
                    onClick={() => void leaveProject()}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </BrowserChromeIconButton>
                </BrowserChromeTooltip>
              </>
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
                className="pointer-events-auto"
                url={address}
                faviconUrl={active.faviconUrl}
                draft={urlDraft === "about:blank" ? "" : urlDraft}
                onDraftChange={setUrlDraft}
                onCommit={commitUrl}
                onNavigateTo={navigateAddressTo}
                showFavicon={false}
                placeholder={
                  isBuildSiteOrApp && !entity?.publishedUrl
                    ? "Not published yet"
                    : "Search"
                }
                autoEditKey={
                  active.kind === "web" &&
                  (address === "about:blank" || active.url === "about:blank")
                    ? active.id
                    : null
                }
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
                <RailBtn
                  label="Open in system browser"
                  onClick={() => {
                    void openUrlInSystemBrowser(active.url || address);
                  }}
                >
                  <Globe className="h-3.5 w-3.5" strokeWidth={1.6} />
                </RailBtn>
              </>
            ) : browserSpaceId === "research" ? (
              <ResearchBrowserToolsMenu
                address={address}
                onShare={async () => {
                  try {
                    await navigator.clipboard.writeText(address);
                  } catch {
                    window.prompt("Copy page address", address);
                  }
                }}
                // Duplicate the actual browser page; an empty search tab stays blank
                // instead of normalizing the project preview or tab title as a query.
                onOpenExternal={() => addUrlTab(active.url || "about:blank")}
                onOpenSystemBrowser={() => {
                  void openUrlInSystemBrowser(active.url || address);
                }}
                onClear={() => navigateAddressTo("about:blank")}
              />
            ) : isBuildSiteOrApp ? (
              <ResearchBrowserToolsMenu
                address={address}
                onShare={async () => {
                  try {
                    await navigator.clipboard.writeText(address);
                  } catch {
                    window.prompt("Copy page address", address);
                  }
                }}
                onOpenExternal={() => addUrlTab(active.url || address)}
                onOpenSystemBrowser={() => {
                  void openUrlInSystemBrowser(active.url || address);
                }}
                onClear={() => navigateAddressTo("about:blank")}
              />
            ) : (
              <DesktopProjectToolsMenu
                canRename={canRename}
                publishLabel="Publish"
                onRename={() => {
                  setRenameTarget("project");
                  setDesktopRenameOpen(true);
                }}
                onPublish={() => openOverlay("publish")}
                onDomain={() => openOverlay("domains")}
                onOpenExternal={() => addUrlTab(address)}
                onOpenSystemBrowser={() => {
                  void openUrlInSystemBrowser(active.url || address);
                }}
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
          {/* Keep the draft preview mounted across tab switches so the iframe
              does not hard-reload every time the user leaves and comes back. */}
          {session.tabs
            .filter(
              (tab) =>
                tab.id === active.id ||
                tab.kind === "build-preview" ||
                tab.kind === "project-preview",
            )
            .filter(
              (tab, index, tabs) =>
                tabs.findIndex((candidate) => candidate.id === tab.id) === index,
            )
            .map((tab) => {
              const isActiveTab = tab.id === active.id;
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "absolute inset-0 min-h-0",
                    !isActiveTab && "invisible pointer-events-none",
                  )}
                  aria-hidden={!isActiveTab}
                >
          <ProjectBrowserBody
            tab={tab}
            projects={allProjects}
            fallbackName={previewFallbackName}
          fallbackSummary={previewFallbackSummary}
          reloadKey={reloadKey}
          userId={actor.id}
          browserKey={key}
          surfaceActive={surfaceActive && isActiveTab}
          workspaceId={workspaceId}
          projectId={projectId}
          chatImageFallbackSrc={activeStudioChatImage.src}
          chatImageGenerating={activeStudioChatImage.generating}
          sandboxEnvStatus={sandboxEnvStatus}
          sandboxEnvMessage={sandboxEnvMessage}
          sandboxPreviewSrc={sandboxPreviewSrc}
          draftPreviewUrl={draftPreviewUrl}
          websiteSetup={
            showSetupOverlay && isActiveTab
              ? {
                  status: websiteBrief?.status ?? "setup",
                  completedSteps: websiteBrief?.completedSteps ?? 0,
                  // Building status lives in chat; keep panel logo-only.
                  detail:
                    websiteBrief?.status === "failed"
                      ? websiteBrief?.validationIssues?.[0] ||
                        sandboxEnvMessage ||
                        null
                      : null,
                  steps: null,
                }
              : null
          }
          onSandboxRetry={() => {
            if (!projectId || !ctx.workspaceId) return;
            setSandboxEnvStatus("starting");
            setSandboxEnvMessage(null);
            void (async () => {
              try {
                const { requestBuildReadyClient } = await import(
                  "@/lib/api/build-ready-client"
                );
                const finalized = await requestBuildReadyClient({
                  projectId,
                  workspaceId: ctx.workspaceId,
                });
                await refreshWebsiteBrief();
                if (finalized?.ok) {
                  window.dispatchEvent(
                    new CustomEvent("cander:website-setup-ready", {
                      detail: { projectId },
                    }),
                  );
                } else if (finalized && finalized.ok === false) {
                  console.info("[cander:preview] finalize failed", {
                    reason: finalized.reason || finalized.error,
                    diagnostics: finalized.diagnostics,
                  });
                  setSandboxEnvStatus("error");
                  setSandboxEnvMessage("The preview didn’t start. Try again.");
                }
                const m = await import("@/lib/api/project-sandbox-client");
                const result = await m.ensureProjectSandboxClient({
                  projectId,
                  workspaceId: ctx.workspaceId,
                  mode: "repair",
                });
                if (!result) {
                  setSandboxEnvStatus("unavailable");
                  setSandboxEnvMessage("Sign in required.");
                  return;
                }
                setSandboxEnvStatus(result.status);
                setSandboxEnvMessage(result.message ?? result.error ?? null);
                const draftUrl = draftPreviewUrlForSubdomain(result.subdomain);
                if (draftUrl) setDraftPreviewUrl(draftUrl);
                if (
                  result.status === "ready" &&
                  result.hasPreviewUpstream &&
                  result.previewPath &&
                  finalized?.ok
                ) {
                  const { probeDraftPreviewPath } = await import(
                    "@/lib/build/preview/client-health"
                  );
                  const probed = await probeDraftPreviewPath(result.previewPath, {
                    bustCache: true,
                  });
                  if (!probed.ok) {
                    setSandboxEnvStatus("error");
                    setSandboxEnvMessage(probed.message);
                    setSandboxPreviewSrc(null);
                  } else {
                    void applyPreviewSrc(probed.previewSrc);
                  }
                } else {
                  setSandboxPreviewSrc(null);
                  if (result.status === "ready" && !result.hasPreviewUpstream) {
                    setSandboxEnvStatus("starting");
                  }
                }
              } catch (err) {
                setSandboxEnvStatus("error");
                setSandboxEnvMessage(
                  err instanceof Error ? err.message : "Retry failed",
                );
              }
            })();
          }}
          onSandboxReload={() => {
            void (async () => {
              // Cheapest action first: reload the page inside the iframe. If
              // the preview is not healthy, escalate to a runtime repair.
              const { reloadDraftPreview } = await import("@/lib/build/preview/client-iframe");
              if (sandboxEnvStatus === "ready" && sandboxPreviewSrc && reloadDraftPreview()) {
                return;
              }
              if (!projectId || !ctx.workspaceId) return;
              setSandboxEnvStatus("starting");
              setSandboxEnvMessage(null);
              const sandbox = await import("@/lib/api/project-sandbox-client");
              const result = await sandbox.ensureProjectSandboxClient({
                projectId,
                workspaceId: ctx.workspaceId,
                mode: "repair",
              });
              if (!result) return;
              setSandboxEnvStatus(result.status);
              setSandboxEnvMessage(result.message ?? null);
              if (result.status === "ready" && result.hasPreviewUpstream && result.previewPath) {
                const { probeDraftPreviewPath } = await import("@/lib/build/preview/client-health");
                const probed = await probeDraftPreviewPath(result.previewPath, { bustCache: true });
                if (probed.ok) {
                  await applyPreviewSrc(probed.previewSrc);
                  reloadDraftPreview();
                } else {
                  handleProbeFailure(probed);
                }
              }
            })();
          }}
          />
                </div>
              );
            })}
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
      {mobile && showBrowserNavChrome && !showMobileTabBar ? (
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
              : displayHostFromUrl(address) ||
                (isBuildSiteOrApp && !entity?.publishedUrl
                  ? "Not published yet"
                  : "Enter URL")}
          </span>
        </button>
      ) : null}
      {showMobileTabBar ? (
        <ProjectMobileTabBar
          tabs={session.tabs}
          activeId={active.id}
          projects={allProjects}
          projectTitle={projectTitle}
          onSelect={selectTab}
          onClose={requestCloseTab}
          onAdd={openAddSheet}
          generatingTabIds={tabGeneratingIds}
        />
      ) : null}

      <MobileBottomSheet
        open={mobile && Boolean(closeConfirmTab)}
        onClose={() => setCloseConfirmTabId(null)}
        mode="info"
      >
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-1">
          <p className="px-1 text-[17px] font-medium tracking-[-0.02em] text-foreground">
            {closeConfirmIsImage ? "Delete image?" : "Remove website?"}
          </p>
          <p className="mt-1 px-1 text-[13px] text-muted-foreground">
            {closeConfirmIsImage
              ? "This removes the tab from the project. You can’t undo this."
              : "This removes the site from the project. You can’t undo this."}
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-muted/50 px-3 py-3 dark:bg-white/[0.08]">
            {closeConfirmTab ? (
              <TabGlyph tab={closeConfirmTab} className="h-8 w-8 rounded-[8px]" />
            ) : closeConfirmIsImage ? (
              <Image className="h-8 w-8 text-muted-foreground" strokeWidth={1.6} />
            ) : (
              <Globe className="h-8 w-8 text-muted-foreground" strokeWidth={1.6} />
            )}
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em] text-foreground">
              {closeConfirmLabel}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCloseConfirmTabId(null)}
              className="inline-flex h-11 items-center justify-center rounded-full bg-muted text-[15px] font-medium text-foreground transition-colors hover:bg-muted/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const id = closeConfirmTabId;
                setCloseConfirmTabId(null);
                if (id) closeTab(id);
              }}
              className="inline-flex h-11 items-center justify-center rounded-full bg-red-600 text-[15px] font-medium text-white transition-colors hover:bg-red-600/90"
            >
              {closeConfirmIsImage ? "Delete" : "Remove"}
            </button>
          </div>
        </div>
      </MobileBottomSheet>

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
        {isAgentProject ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3">
            <p className="px-1 pb-2 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              Add to project
            </p>
            <button
              type="button"
              onClick={() => {
                addAgentTab();
                setMobileSheet(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2.5 text-left text-[15px] hover:bg-muted/70"
            >
              <Bot className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
              New agent
            </button>
            <button
              type="button"
              onClick={() => {
                addUrlTab();
                setMobileSheet(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2.5 text-left text-[15px] hover:bg-muted/70"
            >
              <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
              Browser tab
            </button>
          </div>
        ) : isStudioProject ? (
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
                  Projects
                </p>
                {(["research", "studio"] as const).map((space) => {
                  const items = extraProjects.filter((item) =>
                    space === "research"
                      ? item.space === "research" || item.space === "home"
                      : item.space === "studio" ||
                        item.space === "build" ||
                        (item.space !== "research" && item.space !== "home"),
                  );
                  if (!items.length) return null;
                  return (
                    <div key={space} className="mb-2">
                      <p className="px-2 pb-1 text-[12px] text-muted-foreground">
                        {space === "research" ? "Search" : "Create"}
                      </p>
                      {items.map((item) => (
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
                    </div>
                  );
                })}
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
  tab: rawTab,
  projects,
  fallbackName,
  fallbackSummary,
  reloadKey,
  userId,
  browserKey,
  surfaceActive,
  workspaceId,
  projectId,
  chatImageFallbackSrc = null,
  chatImageGenerating = false,
  sandboxEnvStatus = null,
  sandboxEnvMessage = null,
  sandboxPreviewSrc = null,
  draftPreviewUrl = null,
  websiteSetup = null,
  onSandboxRetry,
  onSandboxReload,
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
  chatImageFallbackSrc?: string | null;
  chatImageGenerating?: boolean;
  sandboxEnvStatus?: BuildSandboxStatus | null;
  sandboxEnvMessage?: string | null;
  sandboxPreviewSrc?: string | null;
  draftPreviewUrl?: string | null;
  websiteSetup?: {
    status: "setup" | "building" | "ready" | "failed";
    completedSteps: number;
    detail?: string | null;
    steps?: string[] | null;
  } | null;
  onSandboxRetry?: () => void;
  onSandboxReload?: () => void;
}) {
  const tab = repairAgentSurfaceTab(rawTab);
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
    studioCleared?: boolean | null;
    studioFresh?: boolean | null;
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
            faviconUrl:
              patch.url !== "about:blank" ? patch.url : next.faviconUrl,
            studioFresh: undefined,
            ...(patch.title ? { title: patch.title } : {}),
          };
        } else {
          next = navigateProjectBrowserTab(next, patch.url, patch.title);
        }
        if (isHttpUrl(patch.url) && patch.url !== "about:blank") {
          recordBrowserVisit({
            url: patch.url,
            title: patch.title ?? next.title,
          });
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
          ...(patch.boundGenerationId ? { studioFresh: undefined } : {}),
        };
      }
      if (patch.aspectRatio !== undefined) {
        next = { ...next, aspectRatio: patch.aspectRatio };
      }
      if (patch.studioCleared !== undefined) {
        next = {
          ...next,
          studioCleared: patch.studioCleared ? true : undefined,
        };
      }
      if (patch.studioFresh !== undefined) {
        next = {
          ...next,
          studioFresh: patch.studioFresh ? true : undefined,
        };
      }
      return repairAgentSurfaceTab(next);
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

  if (tab.kind === "agent-overview") {
    const match =
      projects.find((item) => item.id === (tab.projectId ?? projectId)) ?? null;
    return (
      <AgentOverviewPanel
        workspaceId={workspaceId}
        projectId={projectId ?? tab.projectId ?? ""}
        projectTitle={match?.title ?? fallbackName}
        onEditInProject={() => {
          if (!projectId) return;
          // Drop overview; agent sync effect will populate builder tabs.
          const sessionFallback = defaultProjectBrowserSession({
            projectId: browserKey.projectId,
            title: fallbackName,
            spaceId: browserKey.spaceId,
            projectKind: "automation",
            agentSurface: "builder",
          });
          setProjectBrowserSession(browserKey, sessionFallback);
        }}
      />
    );
  }

  if (tab.kind === "agent-builder") {
    const agentId = tab.agentId?.trim();
    if (!agentId || !projectId) {
      return (
        <div
          className={cn(
            "relative h-full overflow-hidden",
            BROWSER_CHROME_BG,
          )}
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
      );
    }
    return (
      <AgentBuilderPanel
        workspaceId={workspaceId}
        projectId={projectId}
        agentId={agentId}
        onTitleChange={(title) =>
          syncSurfaceMeta({ title })
        }
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
    const published =
      match?.publishedUrl && isHttpUrl(match.publishedUrl)
        ? match.publishedUrl
        : null;

    // Always keep draft AppViewport after publish — publishing is state only.
    return (
      <AppViewport
        name={match?.title ?? fallbackName}
        summary={
          (match?.summary || fallbackSummary || "").trim() ||
          "Start generating your website in chat."
        }
        envStatus={sandboxEnvStatus}
        envMessage={sandboxEnvMessage}
        previewSrc={sandboxPreviewSrc}
        draftPreviewUrl={draftPreviewUrl}
        publishedUrl={published}
        websiteSetup={websiteSetup}
        onRetryEnv={onSandboxRetry}
        onReloadPreview={onSandboxReload}
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
        studioCleared={Boolean(tab.studioCleared)}
        studioFresh={Boolean(tab.studioFresh)}
        chatImageFallbackSrc={
          tab.studioFresh && !tab.boundGenerationId
            ? null
            : chatImageFallbackSrc
        }
        chatImageGenerating={chatImageGenerating}
        onOpenUrl={openNewInAppTab}
        onSrcChange={(nextUrl, opts) =>
          syncSurfaceMeta(
            nextUrl === "about:blank" || opts?.cleared
              ? {
                  url: "about:blank",
                  title: tab.title,
                  boundGenerationId: null,
                  aspectRatio: null,
                  studioCleared: true,
                  studioFresh: false,
                }
              : {
                  url: nextUrl,
                  title: tab.title,
                  studioCleared: false,
                  studioFresh: false,
                  faviconUrl: nextUrl,
                },
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
  onAddAgent,
  studioMode = false,
  agentMode = false,
  webOnly = false,
  generatingTabIds,
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
  onAddAgent?: () => void;
  studioMode?: boolean;
  agentMode?: boolean;
  webOnly?: boolean;
  generatingTabIds?: Set<string>;
}) {
  return (
    <div className="relative z-20 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const studioIndex =
          tab.kind === "studio-image"
            ? tabs
                .filter((item) => item.kind === "studio-image")
                .findIndex((item) => item.id === tab.id)
            : -1;
        const label =
          studioIndex >= 0 ? studioImageTabLabel(studioIndex) : undefined;
        return (
          <ProjectTabButton
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            project={projects.find((item) => item.id === tab.projectId)}
            generating={generatingTabIds?.has(tab.id) ?? false}
            label={label}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            canClose={
              !tab.pinned &&
              !(
                tab.kind === "agent-builder" &&
                tabs.filter((item) => item.kind === "agent-builder").length <= 1
              )
            }
          />
        );
      })}
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
          onAddAgent={onAddAgent}
          studioMode={studioMode}
          agentMode={agentMode}
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
  generatingTabIds,
}: {
  tabs: ProjectBrowserTab[];
  activeId: string;
  projects: SpaceProject[];
  projectTitle: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  generatingTabIds?: Set<string>;
}) {
  const labelFor = (tab: ProjectBrowserTab) => {
    if (tab.kind === "studio-image") {
      const studioIndex = tabs
        .filter((item) => item.kind === "studio-image")
        .findIndex((item) => item.id === tab.id);
      if (studioIndex >= 0) return studioImageTabLabel(studioIndex);
    }
    if (!isPreviewTabKind(tab.kind)) return tab.title;
    if (tab.id === activeId && projectTitle) return projectTitle;
    const match = projects.find((item) => item.id === tab.projectId);
    return match?.title || tab.title;
  };

  return (
    <MobileFloatingNav activeId={activeId} label="Project tabs">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const label = labelFor(tab);
        const canClose = !tab.pinned;
        const generating = generatingTabIds?.has(tab.id) ?? false;
        return (
          <button
            key={tab.id}
            type="button"
            aria-busy={generating || undefined}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (!active) onSelect(tab.id);
            }}
            className={cn(
              "inline-flex h-10 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] tracking-[-0.01em] transition-colors",
              active
                ? "bg-muted/70 text-foreground"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {generating ? (
              <span
                className="thinking-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b4fc4]"
                aria-hidden
              />
            ) : (
              <TabGlyph tab={tab} className="h-3.5 w-3.5" />
            )}
            <span className="truncate">
              {generating ? "Generating…" : label}
            </span>
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
    </MobileFloatingNav>
  );
}

function ResearchBrowserToolsMenu({
  address,
  onShare,
  onOpenExternal,
  onOpenSystemBrowser,
  onClear,
}: {
  address: string;
  onShare: () => void | Promise<void>;
  onOpenExternal: () => void;
  onOpenSystemBrowser: () => void;
  onClear: () => void;
}) {
  return (
    <BrowserChromeDropdown
      align="end"
      matchTrigger={false}
      menuClassName="min-w-[13rem] z-[320]"
      trigger={({ toggle }) => (
        <RailBtn label="Browser tools" onClick={toggle}>
          <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
      )}
    >
      {(close) => (
        <>
          <DesktopMenuItem
            icon={Share}
            onClick={() => {
              void onShare();
              close();
            }}
          >
            Copy page link
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
            icon={Globe}
            onClick={() => {
              onOpenSystemBrowser();
              close();
            }}
            disabled={address === "about:blank"}
          >
            Open in system browser
          </DesktopMenuItem>
          <DesktopMenuItem
            icon={Trash2}
            onClick={() => {
              onClear();
              close();
            }}
            disabled={address === "about:blank"}
          >
            Clear page
          </DesktopMenuItem>
        </>
      )}
    </BrowserChromeDropdown>
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
  canRename,
  publishLabel = "Publish",
  viewport,
  onCycleViewport,
  onRename,
  onPublish,
  onDomain,
  onOpenExternal,
  onOpenSystemBrowser,
  onRefresh,
}: {
  canRename: boolean;
  publishLabel?: "Publish" | "Republish";
  viewport?: keyof typeof VIEWPORT_CYCLE;
  onCycleViewport?: () => void;
  onRename: () => void;
  onPublish: () => void;
  onDomain: () => void;
  onOpenExternal: () => void;
  onOpenSystemBrowser: () => void;
  onRefresh: () => void;
}) {
  const ViewportIcon = viewport ? VIEWPORT_CYCLE[viewport].Icon : Monitor;
  const viewportLabel = viewport
    ? `${VIEWPORT_CYCLE[viewport].label} · next ${VIEWPORT_CYCLE[VIEWPORT_CYCLE[viewport].next].label.toLowerCase()}`
    : "Desktop";
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
            {publishLabel}
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
            icon={Globe}
            onClick={() => {
              onOpenSystemBrowser();
              close();
            }}
          >
            Open in system browser
          </DesktopMenuItem>
          {onCycleViewport ? (
            <DesktopMenuItem
              icon={ViewportIcon}
              onClick={() => {
                onCycleViewport();
                close();
              }}
            >
              {viewportLabel}
            </DesktopMenuItem>
          ) : null}
          <DesktopMenuItem
            icon={RotateCw}
            onClick={() => {
              onRefresh();
              close();
            }}
          >
            Reload
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
  disabled = false,
}: {
  children: string;
  active?: boolean;
  onClick: () => void;
  icon: typeof Upload;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] tracking-[-0.01em] hover:bg-muted",
        active && "bg-muted",
        disabled && "pointer-events-none opacity-40",
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

function studioImageTabLabel(index: number) {
  return index === 0 ? "Image" : `Image ${index + 1}`;
}

function ProjectTabButton({
  tab,
  active,
  project,
  generating = false,
  label,
  onSelect,
  onClose,
  canClose = true,
}: {
  tab: ProjectBrowserTab;
  active: boolean;
  project?: SpaceProject;
  generating?: boolean;
  /** Override title (e.g. Image 2). */
  label?: string;
  onSelect: () => void;
  onClose: () => void;
  canClose?: boolean;
}) {
  const title =
    label ||
    tab.title ||
    (tab.url !== "about:blank" ? tab.url : "");
  return (
    <button
      type="button"
      aria-busy={generating || undefined}
      aria-pressed={active}
      onClick={() => onSelect()}
      className={cn(
        "group relative z-10 inline-flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] tracking-[-0.01em] transition-colors duration-200",
        active
          ? cn(BROWSER_CHROME_CHIP, "text-foreground")
          : cn("text-muted-foreground", BROWSER_CHROME_CHIP_HOVER, "hover:text-foreground"),
      )}
    >
      {generating ? (
        <span
          className="thinking-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b4fc4]"
          aria-hidden
        />
      ) : (
        <TabGlyph tab={tab} kind={project?.kind} />
      )}
      <span
        className={cn(
          "truncate",
          !title && tab.url === "about:blank" && "min-w-[2rem]",
        )}
      >
        {generating ? "Generating…" : title}
      </span>
      {canClose ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Close ${title || "tab"}`}
          onClick={(event) => {
            event.preventDefault();
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
          className="pointer-events-none inline-flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-muted"
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
  onAddAgent,
  studioMode = false,
  agentMode = false,
  compact = false,
}: {
  extraProjects: SpaceProject[];
  onAddUrl: () => void;
  onAddProject: (project: SpaceProject) => void;
  onAddStudioMedia?: (
    kind: "studio-image" | "studio-document",
  ) => void;
  onAddAgent?: () => void;
  studioMode?: boolean;
  agentMode?: boolean;
  compact?: boolean;
}) {
  const exploreProjects = extraProjects.filter(
    (item) => item.space === "research" || item.space === "home",
  );
  const createProjects = extraProjects.filter(
    (item) => item.space === "studio" || item.space === "build",
  );
  const otherProjects = extraProjects.filter(
    (item) =>
      item.space !== "research" &&
      item.space !== "home" &&
      item.space !== "studio" &&
      item.space !== "build",
  );
  const projectGroups = [
    { id: "explore", label: "Search", items: exploreProjects },
    {
      id: "create",
      label: "Create",
      items: [...createProjects, ...otherProjects],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <BrowserChromeDropdown
      align="start"
      matchTrigger={false}
      menuClassName="min-w-[12.5rem] z-[320]"
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
          {agentMode && onAddAgent ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAddAgent();
                close();
              }}
              className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted"
            >
              <Bot className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
              New agent
            </button>
          ) : null}
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
            {studioMode ? "Browser tab" : "New tab"}
          </button>
          {projectGroups.length ? (
            <Dropdown
              placement="right"
              align="start"
              matchTrigger={false}
              submenu
              menuClassName="min-w-[14rem] max-h-[min(20rem,50vh)] overflow-y-auto z-[330]"
              className="w-full"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={toggle}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted",
                    open && "bg-muted",
                  )}
                >
                  <FolderKanban
                    className="h-3.5 w-3.5 text-muted-foreground"
                    strokeWidth={1.6}
                  />
                  <span className="min-w-0 flex-1">Projects</span>
                  <ChevronRight
                    className="h-3.5 w-3.5 text-muted-foreground"
                    strokeWidth={1.8}
                  />
                </button>
              )}
            >
              {(closeProjects) => (
                <>
                  {projectGroups.map((group, index) => (
                    <div key={group.id}>
                      <p
                        className={cn(
                          "px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase",
                          index === 0 ? "pt-1" : "pt-2",
                        )}
                      >
                        {group.label}
                      </p>
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onAddProject(item);
                            closeProjects();
                            close();
                          }}
                          className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted"
                        >
                          <KindGlyph kind={item.kind} />
                          <span className="truncate">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </Dropdown>
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
  studioCleared = false,
  studioFresh = false,
  chatImageFallbackSrc = null,
  chatImageGenerating = false,
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
  studioCleared?: boolean;
  /** + Image tab — do not inherit another canvas until bound/upload. */
  studioFresh?: boolean;
  chatImageFallbackSrc?: string | null;
  chatImageGenerating?: boolean;
  onSrcChange: (next: string, opts?: { cleared?: boolean }) => void;
  onAspectRatioChange: (ratio: string | null) => void;
  onOpenUrl?: (url: string) => void;
}) {
  const { ctx } = useSpaceData();
  const { updateProject } = useSpaceMutation();
  const { project } = useSpaceProject(projectId);
  const { thread } = useApp();
  const mobile = useMobileShell();
  const fileRef = useRef<HTMLInputElement>(null);
  const appliedGenerationRef = useRef<string | null>(null);
  const optimisticObjectUrlRef = useRef<string | null>(null);
  const mobileMediaActionsRef = useRef({
    onDownload: () => {},
    onReplace: () => {},
    onRemove: () => {},
  });
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

  const imageJob = useMemo(() => {
    if (kind !== "studio-image" || !thread || studioCleared) return null;
    if (boundGenerationId) {
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
    }
    // Fresh + Image tabs stay empty until a job binds — don't claim the latest.
    if (studioFresh) return null;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const message = thread.messages[i]!;
      for (let j = (message.blocks?.length ?? 0) - 1; j >= 0; j--) {
        const block = message.blocks![j]!;
        if (block.type !== "image_generation") continue;
        if (block.status === "generating" || block.status === "completed") {
          return block;
        }
      }
    }
    return null;
  }, [kind, thread, boundGenerationId, studioCleared, studioFresh]);

  const chatImageSrc = useMemo(() => {
    if (studioCleared) return null;
    if (studioFresh && !boundGenerationId) return null;
    if (chatImageFallbackSrc?.trim()) return chatImageFallbackSrc.trim();
    if (!imageJob || imageJob.status !== "completed") return null;
    return canvasSrcFromImageJob(imageJob);
  }, [
    chatImageFallbackSrc,
    imageJob,
    studioCleared,
    studioFresh,
    boundGenerationId,
  ]);

  // Prefer durable studio / optimistic preview URLs; otherwise live chat URL —
  // unless the user explicitly cleared the canvas.
  const displaySrc = studioCleared
    ? src && src !== "about:blank"
      ? src
      : ""
    : (src && isStudioAssetUrl(src) ? src : null) ||
      (src && (src.startsWith("blob:") || src.startsWith("data:"))
        ? src
        : null) ||
      chatImageSrc ||
      (src && src !== "about:blank" ? src : "") ||
      "";
  const hasMedia = Boolean(displaySrc);
  const isUploading = activity?.type === "upload";
  const isEditing = activity?.type === "edit";

  const isGenerating =
    kind === "studio-image" &&
    !studioCleared &&
    (chatImageGenerating ||
      (imageJob?.status === "generating" &&
        (boundGenerationId
          ? imageJob.generationId === boundGenerationId
          : true)));
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

  const revokeOptimisticUrl = () => {
    if (optimisticObjectUrlRef.current) {
      URL.revokeObjectURL(optimisticObjectUrlRef.current);
      optimisticObjectUrlRef.current = null;
    }
  };

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
      (source === "upload" || source === "generate") &&
      (!project?.cover || studioCoverAcceptsFirstGenerated(project.cover))
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

  useEffect(() => () => revokeOptimisticUrl(), []);

  // Mirror chat image onto the tab URL when the canvas is still empty.
  useEffect(() => {
    if (kind !== "studio-image") return;
    if (studioCleared) return;
    if (studioFresh && !boundGenerationId) return;
    if (!chatImageSrc) return;
    if (src && src !== "about:blank") return;
    onSrcChange(chatImageSrc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per chat URL
  }, [kind, chatImageSrc, src, studioCleared, studioFresh, boundGenerationId]);

  // Restore empty canvases. Bound tabs use their chat generation URL — never
  // steal the project's newest asset onto the wrong tab. Fresh + Image tabs
  // stay empty until a generation binds or the user uploads.
  useEffect(() => {
    if (kind !== "studio-image" || !projectId) return;
    if (studioCleared) return;
    if (hasMedia || src === "about:blank") return;
    if (isGenerating || activity) return;
    if (studioFresh && !boundGenerationId) return;

    if (boundGenerationId) {
      const fromJob = chatImageSrc || imageJob?.imageUrl?.trim();
      if (fromJob) {
        onSrcChange(fromJob);
        return;
      }
      if (imageJob?.status === "generating") return;
      if (!imageJob || imageJob.status !== "completed") return;
    } else if (thread) {
      const generatingChatImage = thread.messages.some((message) =>
        (message.blocks ?? []).some(
          (block) =>
            block.type === "image_generation" &&
            block.status === "generating",
        ),
      );
      if (generatingChatImage) return;
      if (chatImageSrc) {
        onSrcChange(chatImageSrc);
        return;
      }
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
    chatImageSrc,
    thread,
    studioCleared,
    studioFresh,
  ]);

  useEffect(() => {
    if (kind !== "studio-image") return;
    if (studioCleared) return;
    if (!imageJob || imageJob.status !== "completed") return;
    const generationId = imageJob.generationId;
    const url =
      chatImageSrc ||
      imageJob.imageUrl?.trim() ||
      "";
    if (!url) return;
    if (appliedGenerationRef.current === generationId) return;

    // Durable canvas already exists (including edits) — do not re-seed from chat.
    if (isStudioAssetUrl(src)) {
      appliedGenerationRef.current = generationId;
      return;
    }

    // Persist into studio_project_assets even when chat already rewrote the URL
    // to a durable attachment path (so other clients can restore the canvas).
    const shouldPersist =
      Boolean(projectId) &&
      (url.startsWith("data:") ||
        url.includes("/api/ai/raw-openai/attachments/") ||
        (!isStudioAssetUrl(url) && url.startsWith("http")));

    if (!shouldPersist) {
      appliedGenerationRef.current = generationId;
      return;
    }

    let cancelled = false;

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
        if (!cancelled) {
          appliedGenerationRef.current = generationId;
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist once per completed generation
  }, [kind, imageJob?.generationId, imageJob?.status, imageJob?.imageUrl, chatImageSrc, studioCleared]);

  const runEdit = async (
    action: "remove-bg" | "resize" | "suggest-edit",
    opts?: { resizePreset?: StudioResizePresetId; prompt?: string },
  ) => {
    if (!projectId || !displaySrc || activity) return;
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
        imageUrl: displaySrc,
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

    // Optimistic preview for images — show immediately, upload in background.
    if (kind === "studio-image") {
      revokeOptimisticUrl();
      const objectUrl = URL.createObjectURL(file);
      optimisticObjectUrlRef.current = objectUrl;
      onSrcChange(objectUrl);

      void (async () => {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error("Could not read image."));
            reader.onerror = () => reject(new Error("Could not read image."));
            reader.readAsDataURL(file);
          });
          if (!projectId) {
            revokeOptimisticUrl();
            onSrcChange(dataUrl);
            return;
          }
          const stored = await uploadStudioProjectAsset({
            workspaceId,
            projectId,
            dataUrl,
            source: "upload",
            aspectRatio: lockedAspectRatio ?? null,
          });
          revokeOptimisticUrl();
          onSrcChange(stored.url);
          if (
            !project?.cover ||
            studioCoverAcceptsFirstGenerated(project.cover)
          ) {
            void updateProject(ctx, projectId, { cover: stored.url }).catch(
              () => {},
            );
          }
        } catch (err) {
          revokeOptimisticUrl();
          setError(
            err instanceof Error ? err.message : "Could not upload image.",
          );
          onSrcChange("about:blank", { cleared: true });
        } finally {
          setActivity(null);
        }
      })();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setActivity(null);
        return;
      }
      onSrcChange(result);
      setActivity(null);
    };
    reader.onerror = () => {
      setActivity(null);
      setError("Could not read that file.");
    };
    reader.readAsDataURL(file);
  };

  const clearCanvas = () => {
    setError(null);
    setNaturalRatio({ w: 1, h: 1 });
    revokeOptimisticUrl();
    const assetId =
      studioAssetIdFromClientUrl(src) || studioAssetIdFromClientUrl(displaySrc);
    const wasCover =
      Boolean(project?.cover) &&
      (project?.cover === src ||
        project?.cover === displaySrc ||
        project?.cover === chatImageSrc);
    onSrcChange("about:blank", { cleared: true });
    if (assetId) {
      void deleteStudioProjectAsset(assetId).catch(() => {});
    }
    // Only clear the project card cover when this tab's image was the cover.
    if (projectId && wasCover) {
      void updateProject(ctx, projectId, { cover: "" }).catch(() => {});
    }
  };

  const downloadCurrent = () => {
    if (!displaySrc || saving) return;
    setSaving(true);
    setError(null);
    const name =
      kind === "studio-video" ? "studio-video.mp4" : "studio-image.png";
    void saveGeneratedImage({ url: displaySrc, name })
      .then((res) => {
        if (!res.ok) {
          setError(res.error || "Could not download.");
        }
      })
      .finally(() => setSaving(false));
  };

  const canvasBusy = Boolean(activity) || isGenerating;

  mobileMediaActionsRef.current = {
    onDownload: downloadCurrent,
    onReplace: () => fileRef.current?.click(),
    onRemove: clearCanvas,
  };

  useEffect(() => {
    if (kind !== "studio-image") return;
    const publish = () =>
      window.dispatchEvent(
        new CustomEvent("mobile-project-media-actions", {
          detail: {
            onDownload: () => mobileMediaActionsRef.current.onDownload(),
            onReplace: () => mobileMediaActionsRef.current.onReplace(),
            onRemove: () => mobileMediaActionsRef.current.onRemove(),
          },
        }),
      );
    publish();
    return () => {
      window.dispatchEvent(
        new CustomEvent("mobile-project-media-actions", { detail: null }),
      );
    };
  }, [kind]);

  const showImageArtboard =
    kind === "studio-image" &&
    (hasMedia || isGenerating || isEditing || studioCleared);
  const showEmpty =
    !hasMedia &&
    !isGenerating &&
    !isEditing &&
    !isUploading &&
    !(kind === "studio-image" && studioCleared);
  const showImageToolbar =
    kind === "studio-image" && (hasMedia || isGenerating || isEditing);
  // Mobile: keep toolbar in document flow under the chrome. Absolute + safe-area
  // offsets drift on iOS and paint the bar over the artboard.
  const mobileFlowToolbar = mobile && showImageToolbar;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        mobile ? "bg-white dark:bg-black" : BROWSER_CHROME_BG,
        mobile &&
          !mobileFlowToolbar &&
          "-mt-[calc(env(safe-area-inset-top,0px)+3.375rem)]",
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
      {showImageToolbar ? (
        <div
          className={cn(
            mobileFlowToolbar && "shrink-0 pb-3 pt-1",
          )}
        >
          <StudioImageToolbar
            positioned={!mobileFlowToolbar}
            busy={canvasBusy}
            onRemoveBackground={() => void runEdit("remove-bg")}
            onResize={(preset) => void runEdit("resize", { resizePreset: preset })}
            onSuggestEdit={(prompt) =>
              void runEdit("suggest-edit", { prompt })
            }
          />
        </div>
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
        <div
          className={cn(
            "@container flex min-h-0 flex-1 items-center justify-center px-8",
            mobileFlowToolbar ? "pb-[4.25rem] pt-1" : "pt-[4.75rem] pb-[4.25rem]",
          )}
        >
          <div
            className="relative overflow-hidden rounded-[18px] bg-neutral-200/80 shadow-[0_10px_32px_rgba(0,0,0,0.08)] transition-[width,height] duration-300 ease-out dark:bg-neutral-900"
            style={studioArtboardStyle(frameRatio.w, frameRatio.h)}
          >
            {hasMedia && !showMesh ? (
              <img
                src={displaySrc}
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
            {!hasMedia && !showMesh ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-background/80">
                  <Icon
                    className="h-5 w-5 text-muted-foreground"
                    strokeWidth={1.5}
                  />
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

      {hasMedia &&
      (kind === "studio-video" || (kind === "studio-image" && !mobile)) ? (
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
            onClick={clearCanvas}
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
  const surface = repairAgentSurfaceTab(tab);
  if (surface.kind === "agent-builder" || surface.kind === "agent-overview") {
    return <Bot className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={1.6} />;
  }
  if (tab.kind === "agent-browser") {
    return <MousePointer2 className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={1.6} />;
  }
  if (tab.kind === "studio-image") {
    const thumb =
      (tab.faviconUrl && tab.faviconUrl !== "about:blank"
        ? tab.faviconUrl
        : null) ||
      (tab.url &&
      tab.url !== "about:blank" &&
      tab.url.trim() &&
      (tab.url.startsWith("http") ||
        tab.url.startsWith("data:image") ||
        tab.url.startsWith("blob:") ||
        isStudioAssetUrl(tab.url))
        ? tab.url
        : null);
    if (thumb) {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- tiny tab favicon from canvas URL
        <img
          src={thumb}
          alt=""
          className={cn(
            "h-3.5 w-3.5 shrink-0 rounded-[3px] object-cover",
            className,
          )}
        />
      );
    }
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

/** Single viewport toggle: each click steps desktop → tablet → mobile → desktop. */
const VIEWPORT_CYCLE = {
  desktop: { label: "Desktop", Icon: Monitor, next: "tablet" as const },
  tablet: { label: "Tablet", Icon: Tablet, next: "mobile" as const },
  mobile: { label: "Mobile", Icon: Smartphone, next: "desktop" as const },
} as const;

function RailBtn({
  label,
  children,
  onClick,
  disabled,
  active,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
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
          active && "bg-black/[0.06] text-foreground dark:bg-white/[0.1]",
        )}
      >
        {children}
      </button>
    </BrowserChromeTooltip>
  );
}
