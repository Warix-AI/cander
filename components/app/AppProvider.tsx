"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { accountPresets, projects, starterThreads } from "@/lib/data";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
  workspaceById,
} from "@/lib/workspace-catalog";
import { inferIntent, nextId } from "@/lib/intent";
import { latestThreadForProject } from "@/lib/selectors";
import { inferPlatformIntent } from "@/lib/platform-intent";
import {
  buildCard,
  classifyTurn,
  connectService,
  friendlyTitle,
  labelFor,
  makeCheckpoint,
  planFor,
  researchReply,
  skillReply,
  suggestionsFor,
} from "@/lib/build-loop";
import {
  getActorServerSnapshot,
  getActorSnapshot,
  getHostingServerSnapshot,
  getHostingSnapshot,
  getPersonalSpaceServerSnapshot,
  getPersonalSpaceSnapshot,
  getProductServerSnapshot,
  getProductSnapshot,
  getWorkspaceServerSnapshot,
  getWorkspaceSnapshot,
  persistActor,
  persistHosting,
  persistPersonalSpace,
  persistProduct,
  persistWorkspace,
  getPinsServerSnapshot,
  getPinsSnapshot,
  getSidebarServerSnapshot,
  getSidebarSnapshot,
  moveSidebarNav as persistMoveSidebarNav,
  subscribeActor,
  subscribeHosting,
  subscribePins,
  subscribePersonalSpace,
  subscribeProduct,
  subscribeSidebar,
  subscribeWorkspace,
  toggleStoredPin,
  reorderStoredPins,
} from "@/lib/session";
import {
  getMembersServerSnapshot,
  getMembersSnapshot,
  getPoliciesServerSnapshot,
  getPoliciesSnapshot,
  memberSpaces,
  subscribePolicies,
} from "@/lib/workspace-policy";
import {
  entitlementsFor,
  homeWorkspaceId,
  type Entitlements,
} from "@/lib/entitlements";
import { isChatSpace, PRIMARY_NAV_SPACES, spaceAllowed, type SidebarLayout, type SidebarNavId } from "@/lib/spaces";
import type {
  AccountPresetId,
  BuildTool,
  CourierView,
  BillingPlan,
  HostingMode,
  Checkpoint,
  Message,
  Member,
  MobileSurface,
  OverlayId,
  PageReference,
  PanelIntent,
  PanelMode,
  Pin,
  PinKind,
  PlatformNav,
  PreviewNodeId,
  ProductId,
  Project,
  ProjectMemory,
  ResearchTool,
  SettingsTab,
  SkillsTool,
  SpaceId,
  SpaceLayout,
  StudioTool,
  Thread,
  ViewportId,
  VoiceAnchor,
  Workspace,
  WorkspacePolicy,
} from "@/lib/types";
import { isSpaceLibrarySpace } from "@/lib/space-library";
import {
  summarizeSession,
  upsertPersistentPlatformThread,
  upsertPersistentSpaceThread,
} from "@/lib/persistent-chat";

type Snapshot = {
  product: ProductId;
  view: CourierView;
  spaceId: SpaceId | null;
  threadId: string | null;
  projectId: string | null;
  platformNav: PlatformNav;
  panelMode: PanelMode;
  panelIntent: PanelIntent;
  connectorId: string | null;
  jobId: string | null;
  skillId: string | null;
};

function sameSnap(a: Snapshot, b: Snapshot) {
  return (
    a.product === b.product &&
    a.view === b.view &&
    a.spaceId === b.spaceId &&
    a.threadId === b.threadId &&
    a.projectId === b.projectId &&
    a.platformNav === b.platformNav
  );
}

type SendOpts = {
  space?: SpaceId;
  skillId?: string;
};

type AppContextValue = {
  product: ProductId;
  setProduct: (id: ProductId) => void;
  hostingMode: HostingMode;
  setHostingMode: (id: HostingMode) => void;
  actor: Member;
  actorId: string;
  setActor: (id: string) => void;
  setPreview: (id: AccountPresetId) => void;
  entitlements: Entitlements;
  billingPlan: BillingPlan;
  setBillingPlan: (plan: BillingPlan) => void;
  personalSpaceEnabled: boolean;
  setPersonalSpaceEnabled: (on: boolean) => void;
  workspacePolicies: Record<string, WorkspacePolicy>;
  orgMembers: Member[];
  workspaceId: string;
  setWorkspace: (id: string) => void;
  workspace: Workspace;
  view: CourierView;
  threads: Thread[];
  threadId: string | null;
  thread: Thread | null;
  platformThreadId: string | null;
  spaceId: SpaceId | null;
  projectId: string | null;
  project: Project | undefined;
  panelMode: PanelMode;
  panelIntent: PanelIntent;
  panelRatio: number;
  setPanelRatio: (n: number) => void;
  setPanelMode: (mode: PanelMode) => void;
  setPanelIntent: (intent: PanelIntent) => void;
  mobileSurface: MobileSurface;
  setMobileSurface: (surface: MobileSurface) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  workspaceRailOpen: boolean;
  setWorkspaceRailOpen: (open: boolean) => void;
  toggleLeftPanel: () => void;
  mobileNav: boolean;
  setMobileNav: (open: boolean) => void;
  dragging: boolean;
  setDragging: (on: boolean) => void;
  drafting: boolean;
  buildTool: BuildTool;
  setBuildTool: (tool: BuildTool) => void;
  studioTool: StudioTool;
  setStudioTool: (tool: StudioTool) => void;
  researchTool: ResearchTool;
  setResearchTool: (tool: ResearchTool) => void;
  skillsTool: SkillsTool;
  setSkillsTool: (tool: SkillsTool) => void;
  skillId: string | null;
  fileId: string | null;
  connectorId: string | null;
  jobId: string | null;
  scheduledFilter: string;
  setScheduledFilter: (id: string) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  spaceLayout: SpaceLayout;
  setSpaceLayout: (layout: SpaceLayout) => void;
  overlay: OverlayId;
  settingsSpaceId: SpaceId | null;
  openOverlay: (id: OverlayId) => void;
  openSpaceSettings: (space: SpaceId) => void;
  closeOverlay: () => void;
  platformNav: PlatformNav;
  setPlatformNav: (id: PlatformNav) => void;
  newChat: (space?: SpaceId) => void;
  /** Resume (or create) the persistent dock chat for a space. */
  openSpaceChat: (space: SpaceId) => void;
  setChatSpace: (id: SpaceId | null) => void;
  armChatInterface: (id: SpaceId) => void;
  collapseDraft: () => void;
  /** Close space chat and restore the full workspace dashboard. */
  closeSpaceChat: () => void;
  clearSessionSummary: (threadId?: string | null) => void;
  updateSessionSummary: (text: string, threadId?: string | null) => void;
  clearPersistentChat: (threadId?: string | null) => void;
  sendMessage: (text: string, opts?: SendOpts) => void;
  platformMessages: Message[];
  sendPlatformMessage: (text: string) => void;
  platformDockOpen: boolean;
  setPlatformDockOpen: (open: boolean) => void;
  openSpace: (id: SpaceId) => void;
  openRecents: () => void;
  openBrowser: (opts?: { chat?: boolean; query?: string }) => void;
  browserChatOpen: boolean;
  setBrowserChatOpen: (open: boolean) => void;
  browserChatRatio: number;
  setBrowserChatRatio: (ratio: number) => void;
  browserPage: PageReference;
  setBrowserPage: (page: PageReference) => void;
  browserSearch: string | null;
  pageReference: PageReference | null;
  setPageReference: (page: PageReference | null) => void;
  clearPageReference: () => void;
  attachBrowserReference: () => void;
  referencePageInSpace: (space: SpaceId) => void;
  spaceLibraryOpen: boolean;
  toggleSpaceLibrary: () => void;
  pins: Pin[];
  isPinned: (kind: PinKind, id: string) => boolean;
  togglePin: (kind: PinKind, id: string) => void;
  reorderPins: (
    from: { kind: PinKind; id: string },
    to: { kind: PinKind; id: string },
  ) => void;
  sidebarLayout: SidebarLayout;
  moveSidebarNav: (id: SidebarNavId, dir: -1 | 1) => void;
  voiceActive: boolean;
  voiceAnchor: VoiceAnchor;
  toggleVoice: () => void;
  setVoiceAnchor: (anchor: VoiceAnchor) => void;
  openProject: (id: string) => void;
  openProjectChat: (id: string) => void;
  openThread: (id: string) => void;
  openShared: () => void;
  openSettings: (tab?: SettingsTab) => void;
  openConnector: (id: string) => void;
  openJob: (id: string) => void;
  openSkill: (id: string) => void;
  openFile: (id: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  advancedMode: boolean;
  setAdvancedMode: (on: boolean) => void;
  viewport: ViewportId;
  setViewport: (id: ViewportId) => void;
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  selectedId: PreviewNodeId | null;
  hoveredId: PreviewNodeId | null;
  setHoveredId: (id: PreviewNodeId | null) => void;
  selectElement: (id: PreviewNodeId) => void;
  checkpoints: Checkpoint[];
  restoreCheckpoint: (id: string) => void;
  previewKey: number;
  refreshPreview: () => void;
  liveUrl: string | null;
  memory: ProjectMemory;
  fillSecret: (keyName: string, value: string) => void;
  publishApp: (url: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function AppProvider({ children }: { children: React.ReactNode }) {
  const product = useSyncExternalStore(
    subscribeProduct,
    getProductSnapshot,
    getProductServerSnapshot,
  );
  const hostingMode = useSyncExternalStore(
    subscribeHosting,
    getHostingSnapshot,
    getHostingServerSnapshot,
  );
  const actorId = useSyncExternalStore(
    subscribeActor,
    getActorSnapshot,
    getActorServerSnapshot,
  );
  const personalSpaceEnabled = useSyncExternalStore(
    subscribePersonalSpace,
    getPersonalSpaceSnapshot,
    getPersonalSpaceServerSnapshot,
  );
  const workspacePolicies = useSyncExternalStore(
    subscribePolicies,
    getPoliciesSnapshot,
    getPoliciesServerSnapshot,
  );
  const orgMembers = useSyncExternalStore(
    subscribePolicies,
    getMembersSnapshot,
    getMembersServerSnapshot,
  );
  const actor = useMemo(
    () => orgMembers.find((item) => item.id === actorId) ?? orgMembers[0],
    [orgMembers, actorId],
  );
  const entitlements = useMemo(() => entitlementsFor(actor), [actor]);
  const billingPlan = entitlements.plan;
  const workspaceId = useSyncExternalStore(
    subscribeWorkspace,
    getWorkspaceSnapshot,
    getWorkspaceServerSnapshot,
  );
  const workspaceCatalog = useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const pins = useSyncExternalStore(
    subscribePins,
    getPinsSnapshot,
    getPinsServerSnapshot,
  );
  const sidebarLayout = useSyncExternalStore(
    subscribeSidebar,
    getSidebarSnapshot,
    getSidebarServerSnapshot,
  );

  const [view, setView] = useState<CourierView>("chat");
  const [threads, setThreads] = useState<Thread[]>(starterThreads);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<SpaceId | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("collapsed");
  const [panelIntent, setPanelIntent] = useState<PanelIntent>("browse");
  const [panelRatio, setPanelRatio] = useState(0.58);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceRailOpen, setWorkspaceRailOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [buildTool, setBuildTool] = useState<BuildTool>("preview");
  const [studioTool, setStudioTool] = useState<StudioTool>("canvas");
  const [researchTool, setResearchTool] = useState<ResearchTool>("browser");
  const [skillsTool, setSkillsTool] = useState<SkillsTool>("editor");
  const [skillId, setSkillId] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [scheduledFilter, setScheduledFilter] = useState("upcoming");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("organization");
  const [platformNav, setPlatformNavState] = useState<PlatformNav>("overview");
  const [platformThreadId, setPlatformThreadId] = useState<string | null>(null);
  const [platformDockOpen, setPlatformDockOpenState] = useState(false);
  const [spaceLayout, setSpaceLayout] = useState<SpaceLayout>("cards");
  const [overlay, setOverlay] = useState<OverlayId>(null);
  const [settingsSpaceId, setSettingsSpaceId] = useState<SpaceId | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceAnchor, setVoiceAnchor] = useState<VoiceAnchor>("bottom-right");
  const [browserChatOpen, setBrowserChatOpen] = useState(false);
  const [browserChatRatio, setBrowserChatRatio] = useState(0.28);
  const [browserPage, setBrowserPage] = useState<PageReference>({
    url: "https://www.google.com",
    title: "Google",
  });
  const [browserSearch, setBrowserSearch] = useState<string | null>(null);
  const [pageReference, setPageReference] = useState<PageReference | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedId, setSelectedId] = useState<PreviewNodeId | null>(null);
  const [hoveredId, setHoveredId] = useState<PreviewNodeId | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [memory, setMemory] = useState<ProjectMemory>({
    purpose: "A calm product the customer can ship from chat.",
    stack: "Next.js, TypeScript, Courier Preview",
    integrations: [],
    features: [],
    rejected: [],
  });
  const [hist, setHist] = useState<{ stack: Snapshot[]; i: number }>({
    stack: [
      {
        product: "courier",
        view: "chat",
        spaceId: null,
        threadId: null,
        projectId: null,
        platformNav: "overview",
        panelMode: "collapsed",
        panelIntent: "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      },
    ],
    i: 0,
  });

  const pushTarget = useCallback((snap: Snapshot) => {
    setHist((h) => {
      const current = h.stack[h.i];
      if (current && sameSnap(current, snap)) return h;
      const stack = h.stack.slice(0, h.i + 1).concat(snap);
      return { stack, i: stack.length - 1 };
    });
  }, []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    persistProduct(snap.product);
    setView(snap.view);
    setSpaceId(snap.spaceId);
    setThreadId(snap.threadId);
    setProjectId(snap.projectId);
    setPlatformNavState(snap.platformNav);
    setPanelMode(snap.panelMode);
    setPanelIntent(snap.panelIntent);
    setConnectorId(snap.connectorId);
    setJobId(snap.jobId);
    setSkillId(snap.skillId);
    setDrafting(false);
  }, []);

  const goBack = useCallback(() => {
    if (hist.i <= 0) return;
    applySnapshot(hist.stack[hist.i - 1]);
    setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) }));
  }, [hist, applySnapshot]);

  const goForward = useCallback(() => {
    if (hist.i >= hist.stack.length - 1) return;
    applySnapshot(hist.stack[hist.i + 1]);
    setHist((h) => ({ ...h, i: Math.min(h.stack.length - 1, h.i + 1) }));
  }, [hist, applySnapshot]);

  const workspace = workspaceById(workspaceId, workspaceCatalog);
  const project = projects.find((item) => item.id === projectId);
  const thread = threads.find((item) => item.id === threadId) ?? null;
  const platformThread =
    threads.find(
      (item) => item.id === platformThreadId && item.product === "platform",
    ) ?? null;
  const platformMessages = platformThread?.messages ?? [];

  const setProduct = useCallback((id: ProductId) => {
    if (id === "platform" && !entitlements.canAccessDevelopment) return;
    persistProduct(id);
    setMobileNav(false);
    setOverlay(null);
    if (id !== "platform") {
      setPlatformDockOpenState(false);
    }
    const nextPanelMode = id === "platform" ? panelMode : "collapsed";
    if (id !== "platform") setPanelMode("collapsed");
    pushTarget({
      product: id,
      view,
      spaceId,
      threadId,
      projectId,
      platformNav,
      panelMode: nextPanelMode,
      panelIntent,
      connectorId,
      jobId,
      skillId,
    });
  }, [
    pushTarget,
    view,
    spaceId,
    threadId,
    projectId,
    platformNav,
    panelMode,
    panelIntent,
    connectorId,
    jobId,
    skillId,
    entitlements.canAccessDevelopment,
  ]);

  const setHostingMode = useCallback((id: HostingMode) => {
    if (!entitlements.hostingAllowed(id)) return;
    persistHosting(id);
  }, [entitlements]);

  const setActor = useCallback((id: string) => {
    persistActor(id);
  }, []);

  const setPreview = useCallback((id: AccountPresetId) => {
    const preset = accountPresets.find((item) => item.id === id);
    if (!preset) return;
    persistActor(preset.actorId);
    setOverlay((current) => (current === "invite-wall" ? null : current));
  }, []);

  const setBillingPlan = useCallback((plan: BillingPlan) => {
    const preset: AccountPresetId =
      plan === "free"
        ? "free"
        : plan === "pro"
          ? "pro"
          : plan === "ultra"
            ? "ultra"
            : "max-owner";
    const match = accountPresets.find((item) => item.id === preset);
    if (match) persistActor(match.actorId);
  }, []);

  const setPersonalSpaceEnabled = useCallback((on: boolean) => {
    persistPersonalSpace(on);
  }, []);

  const setPlatformNav = useCallback(
    (id: PlatformNav) => {
      if (!entitlements.platformNavAllowed(id)) return;
      setPlatformNavState(id);
      let nextThreadId = platformThreadId;
      setThreads((current) => {
        const { threads: next, id: tid } = upsertPersistentPlatformThread(
          current,
          workspaceId,
          id,
        );
        nextThreadId = tid;
        return next;
      });
      setPlatformThreadId(nextThreadId);
      pushTarget({
        product: "platform",
        view,
        spaceId,
        threadId,
        projectId,
        platformNav: id,
        panelMode,
        panelIntent,
        connectorId,
        jobId,
        skillId,
      });
    },
    [
      pushTarget,
      view,
      spaceId,
      threadId,
      projectId,
      panelMode,
      panelIntent,
      connectorId,
      jobId,
      skillId,
      entitlements,
      platformThreadId,
      workspaceId,
    ],
  );

  const setWorkspace = useCallback((id: string) => {
    persistWorkspace(id);
    setProjectId(null);
    setSpaceId(null);
    setThreadId(null);
    setPlatformThreadId(null);
    setView("chat");
    setPanelMode("collapsed");
    setDrafting(false);
    setMobileNav(false);
    setOverlay(null);
  }, []);

  const summarizeThreadById = useCallback((id: string | null) => {
    if (!id) return;
    setThreads((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const summary = summarizeSession(item.messages);
        if (!summary) return item;
        return {
          ...item,
          persistent: item.persistent ?? true,
          sessionSummary: summary,
        };
      }),
    );
  }, []);

  const setPlatformDockOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        summarizeThreadById(platformThreadId);
        setPlatformDockOpenState(false);
        setPanelMode("collapsed");
        return;
      }
      let tid = platformThreadId;
      setThreads((current) => {
        const { threads: next, id } = upsertPersistentPlatformThread(
          current,
          workspaceId,
          platformNav,
        );
        tid = id;
        return next;
      });
      setPlatformThreadId(tid);
      setPlatformDockOpenState(true);
      setPanelMode("split");
      setMobileSurface("chat");
    },
    [platformThreadId, platformNav, workspaceId, summarizeThreadById],
  );

  const toggleLeftPanel = useCallback(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const canRail =
      entitlements.hasWorkspaces && !entitlements.showInviteWall;

    if (desktop) {
      if (!sidebarOpen) {
        setSidebarOpen(true);
        if (canRail) setWorkspaceRailOpen(true);
        return;
      }
      if (canRail && workspaceRailOpen) {
        setWorkspaceRailOpen(false);
        return;
      }
      setSidebarOpen(false);
      return;
    }

    if (!mobileNav) {
      setMobileNav(true);
      if (canRail) setWorkspaceRailOpen(true);
      return;
    }
    if (canRail && workspaceRailOpen) {
      setWorkspaceRailOpen(false);
      return;
    }
    setMobileNav(false);
  }, [
    sidebarOpen,
    workspaceRailOpen,
    mobileNav,
    entitlements.hasWorkspaces,
    entitlements.showInviteWall,
  ]);

  const openSpaceChat = useCallback(
    (space: SpaceId) => {
      if (!isChatSpace(space)) return;
      let tid = "";
      let hasMessages = false;
      setThreads((current) => {
        const { threads: next, id } = upsertPersistentSpaceThread(
          current,
          workspaceId,
          space,
        );
        tid = id;
        hasMessages = Boolean(
          next.find((item) => item.id === id)?.messages.length,
        );
        return next;
      });
      setThreadId(tid);
      setSpaceId(space);
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setMobileNav(false);
      setView("space");
      setPanelIntent("execute");
      setPanelMode("split");
      setMobileSurface("chat");
      setDrafting(!hasMessages);
      if (space === "build") setBuildTool("preview");
      if (space === "studio") setStudioTool("canvas");
      if (space === "research") setResearchTool("browser");
      if (space === "skills") setSkillsTool("editor");
      pushTarget({
        product,
        view: "space",
        spaceId: space,
        threadId: tid,
        projectId: null,
        platformNav,
        panelMode: "split",
        panelIntent: "execute",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [workspaceId, product, platformNav, pushTarget],
  );

  const newChat = useCallback(
    (space?: SpaceId) => {
      if (product === "platform") {
        setPlatformDockOpen(true);
        setMobileNav(false);
        return;
      }
      if (space && isChatSpace(space)) {
        openSpaceChat(space);
        return;
      }
      setThreadId(null);
      setSpaceId(null);
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setMobileNav(false);
      setView("chat");
      setDrafting(false);
      setPanelIntent("browse");
      setPanelMode("collapsed");
      pushTarget({
        product,
        view: "chat",
        spaceId: null,
        threadId: null,
        projectId: null,
        platformNav,
        panelMode: "collapsed",
        panelIntent: "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [product, platformNav, pushTarget, setPlatformDockOpen, openSpaceChat],
  );

  const setChatSpace = useCallback((id: SpaceId | null) => {
    setSpaceId(id);
    setView("chat");
    if (id === "studio") setStudioTool("canvas");
    if (id === "research") setResearchTool("browser");
    if (id === "skills") setSkillsTool("editor");
    if (id === "build") setBuildTool("preview");
    if (!id) {
      setDrafting(false);
      setPanelMode("collapsed");
      setPanelIntent("browse");
    }
  }, []);

  const armChatInterface = useCallback(
    (id: SpaceId) => {
      if (!isChatSpace(id)) return;
      let tid = "";
      let hasMessages = false;
      setThreads((current) => {
        const { threads: next, id: nextId } = upsertPersistentSpaceThread(
          current,
          workspaceId,
          id,
        );
        tid = nextId;
        hasMessages = Boolean(
          next.find((item) => item.id === nextId)?.messages.length,
        );
        return next;
      });
      setThreadId(tid);
      setDrafting(!hasMessages);
      setView("space");
      setSpaceId(id);
      setPanelIntent("execute");
      setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
      setMobileSurface("chat");
      if (id === "build") setBuildTool("preview");
      if (id === "studio") setStudioTool("canvas");
      if (id === "research") setResearchTool("browser");
      if (id === "skills") setSkillsTool("editor");
    },
    [workspaceId],
  );

  const collapseDraft = useCallback(() => {
    setDrafting(false);
    setPanelMode((mode) => (threadId ? mode : "collapsed"));
    if (!threadId) setPanelIntent("browse");
  }, [threadId]);

  const closeSpaceChat = useCallback(() => {
    summarizeThreadById(threadId);
    setDrafting(false);
    setThreadId(null);
    setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setPanelMode("collapsed");
    setPanelIntent("browse");
    setMobileSurface("chat");
    if (view === "space" && spaceId) {
      pushTarget({
        product,
        view: "space",
        spaceId,
        threadId: null,
        projectId: null,
        platformNav,
        panelMode: "collapsed",
        panelIntent: "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    }
  }, [
    view,
    spaceId,
    product,
    platformNav,
    pushTarget,
    threadId,
    summarizeThreadById,
  ]);

  const clearSessionSummary = useCallback(
    (id?: string | null) => {
      const target = id ?? threadId ?? platformThreadId;
      if (!target) return;
      setThreads((current) =>
        current.map((item) =>
          item.id === target ? { ...item, sessionSummary: null } : item,
        ),
      );
    },
    [threadId, platformThreadId],
  );

  const updateSessionSummary = useCallback(
    (text: string, id?: string | null) => {
      const target = id ?? threadId ?? platformThreadId;
      if (!target) return;
      const next = text.trim();
      setThreads((current) =>
        current.map((item) =>
          item.id === target
            ? { ...item, sessionSummary: next || null }
            : item,
        ),
      );
    },
    [threadId, platformThreadId],
  );

  const clearPersistentChat = useCallback(
    (id?: string | null) => {
      const target = id ?? threadId ?? platformThreadId;
      if (!target) return;
      setThreads((current) =>
        current.map((item) =>
          item.id === target
            ? {
                ...item,
                messages: [],
                snippet: "",
                title: "Chat",
                sessionSummary: null,
              }
            : item,
        ),
      );
      setDrafting(true);
    },
    [threadId, platformThreadId],
  );

  const sendMessage = useCallback(
    (text: string, opts?: SendOpts) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const kind = classifyTurn(trimmed);
      const intent = inferIntent(trimmed, workspaceId, opts?.space ?? spaceId);
      const currentChat =
        opts?.space ?? (isChatSpace(spaceId) ? spaceId : null);
      const allowed = memberSpaces(workspaceId, actor.id, workspacePolicies);
      const planOpts = { billingPlan, personalEnabled: personalSpaceEnabled };
      const inferredChat =
        isChatSpace(intent.space) &&
        spaceAllowed(intent.space, allowed, planOpts)
          ? intent.space
          : null;
      const stayInChat =
        kind !== "chat" || Boolean(currentChat) || Boolean(inferredChat);

      if (!stayInChat) {
        const dest =
          spaceAllowed(intent.space, allowed, planOpts)
            ? intent.space
            : "build";
        setView("space");
        setSpaceId(dest);
        setThreadId(null);
        setDrafting(false);
        setConnectorId(intent.connectorId ?? null);
        setJobId(intent.jobId ?? null);
        setPanelMode("collapsed");
        pushTarget({
          product,
          view: "space",
          spaceId: dest,
          threadId: null,
          projectId: null,
          platformNav,
          panelMode: "collapsed",
          panelIntent: "browse",
          connectorId: intent.connectorId ?? null,
          jobId: intent.jobId ?? null,
          skillId: null,
        });
        return;
      }

      const space = inferredChat ?? currentChat ?? "build";
      const matched = intent.projectId
        ? projects.find((item) => item.id === intent.projectId)
        : undefined;
      if (matched && matched.workspaceId !== workspaceId) {
        persistWorkspace(matched.workspaceId);
      }

      const selection = selectedId;
      const userMsg: Message = {
        id: nextId("u"),
        role: "user",
        content: trimmed,
        at: nowTime(),
      };

      let assistantMsg: Message = {
        id: nextId("a"),
        role: "assistant",
        content: intent.reply,
        at: nowTime(),
      };

      if (kind === "undo") {
        const last = checkpoints[0];
        assistantMsg = {
          ...assistantMsg,
          content: last
            ? `Restored “${last.title}”. Preview is back to that version.`
            : "There’s nothing to undo yet.",
        };
        if (last) {
          setCheckpoints((current) => current.slice(1));
          setPreviewKey((value) => value + 1);
        }
      } else if (kind === "why") {
        assistantMsg = {
          ...assistantMsg,
          content: `We built it this way because ${memory.purpose} The stack is ${memory.stack}. ${
            memory.features.length
              ? `Already in: ${memory.features.join(", ")}.`
              : "Nothing has been locked in yet."
          }${
            memory.rejected.length
              ? ` We deliberately skipped ${memory.rejected.join(", ")}.`
              : ""
          }`,
        };
      } else if (kind === "changes") {
        assistantMsg = {
          ...assistantMsg,
          content: "Here’s the product timeline — not a list of files. Open any change to restore it.",
        };
        setBuildTool("activity");
      } else if (kind === "error") {
        assistantMsg = {
          ...assistantMsg,
          content: "",
          blocks: [
            {
              type: "error",
              title: "Courier found a problem",
              body: "The latest change caused the Preview to fail.",
              details: "Module not found: Can't resolve './auth'\nPreview exited with code 1",
            },
          ],
        };
      } else if (kind === "fix") {
        assistantMsg = {
          ...assistantMsg,
          content: "I’ll repair Preview and keep your last good version nearby.",
          blocks: [
            {
              type: "build",
              title: "Repairing Preview",
              items: [
                { id: "r1", label: "Found the broken piece", status: "active" },
                { id: "r2", label: "Restored a working version", status: "pending" },
                { id: "r3", label: "Updating Preview", status: "pending" },
              ],
              details: "app/page.tsx · missing import",
            },
          ],
        };
      } else if (kind === "connect") {
        const service = connectService(trimmed);
        assistantMsg = {
          ...assistantMsg,
          content: `Let’s connect ${service.service}. I’ll keep keys out of the source.`,
          blocks: [{ type: "connect", service: service.service, status: "pending" }],
        };
      } else if (kind === "secret") {
        const service = connectService(trimmed);
        assistantMsg = {
          ...assistantMsg,
          content: "",
          blocks: [
            {
              type: "secret",
              service: service.service,
              keyName: service.keyName,
            },
          ],
        };
      } else if (kind === "deploy") {
        const slug = (matched?.name ?? project?.name ?? "app")
          .toLowerCase()
          .replace(/\s+/g, "-");
        assistantMsg = {
          ...assistantMsg,
          content: "Courier can publish this for you. No build pipeline to manage.",
          blocks: [
            {
              type: "deploy",
              url: liveUrl ?? `https://${slug}.courier.app`,
              status: liveUrl ? "live" : "ready",
            },
          ],
        };
        setOverlay("publish");
      } else if (kind === "skill") {
        const skill = skillReply(trimmed);
        assistantMsg = { ...assistantMsg, content: skill.content, blocks: skill.blocks };
      } else if (kind === "research") {
        const research = researchReply();
        assistantMsg = {
          ...assistantMsg,
          content: research.content,
          blocks: research.blocks,
        };
      } else if (kind === "build" || kind === "refine") {
        assistantMsg = {
          ...assistantMsg,
          content: selection
            ? `I’ll change the ${labelFor(selection)} and leave the rest alone.`
            : "I’ll take care of that. Preview will update when it’s ready.",
          blocks: [
            ...planFor(trimmed, selection),
            buildCard(trimmed, selection),
          ],
        };
      }

      const assistantId = assistantMsg.id;
      const usePersistent =
        Boolean(space) &&
        isChatSpace(space) &&
        !projectId &&
        !intent.projectId &&
        (view === "space" || Boolean(opts?.space));
      let activeId = threadId ?? nextId("t");

      setThreads((current) => {
        let list = current;
        if (usePersistent && space) {
          const upserted = upsertPersistentSpaceThread(
            list,
            workspaceId,
            space,
          );
          list = upserted.threads;
          activeId = upserted.id;
        }
        const existing = list.find((item) => item.id === activeId);
        if (existing) {
          return list.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  title: item.messages.length ? item.title : trimmed.slice(0, 48),
                  snippet: trimmed,
                  updatedAt: "Just now",
                  spaceId: space,
                  projectId: intent.projectId ?? item.projectId,
                  workspaceId: matched?.workspaceId ?? item.workspaceId,
                  persistent: usePersistent ? true : item.persistent,
                  sessionSummary: null,
                  messages: [...item.messages, userMsg, assistantMsg],
                }
              : item,
          );
        }
        const created: Thread = {
          id: activeId,
          title: trimmed.slice(0, 52),
          workspaceId: matched?.workspaceId ?? workspaceId,
          projectId: intent.projectId,
          spaceId: space,
          updatedAt: "Just now",
          snippet: trimmed,
          messages: [userMsg, assistantMsg],
          persistent: usePersistent || undefined,
          sessionSummary: null,
        };
        return [created, ...list];
      });
      setThreadId(activeId);
      setDrafting(false);

      if (kind === "build" || kind === "refine" || kind === "fix") {
        const checkpoint = makeCheckpoint(trimmed, selection);
        const build = assistantMsg.blocks?.find((block) => block.type === "build");
        const count = build && build.type === "build" ? build.items.length : 0;
        for (let index = 0; index < count; index += 1) {
          window.setTimeout(() => {
            setThreads((current) =>
              current.map((thread) =>
                thread.id !== activeId
                  ? thread
                  : {
                      ...thread,
                      messages: thread.messages.map((message) => {
                        if (message.id !== assistantId) return message;
                        return {
                          ...message,
                          blocks: message.blocks?.map((block) => {
                            if (block.type !== "build") return block;
                            const items = block.items.map((item, itemIndex) => ({
                              ...item,
                              status:
                                itemIndex < index
                                  ? "done"
                                  : itemIndex === index
                                    ? "done"
                                    : itemIndex === index + 1
                                      ? "active"
                                      : "pending",
                            })) as typeof block.items;
                            const complete = index === count - 1;
                            return {
                              ...block,
                              items,
                              complete,
                              title: complete ? "Build complete" : block.title,
                            };
                          }),
                        };
                      }),
                    },
              ),
            );
            if (index === count - 1) {
              setCheckpoints((current) => [checkpoint, ...current]);
              setPreviewKey((value) => value + 1);
              setMemory((current) => ({
                ...current,
                purpose: /(crm|landscap)/.test(trimmed.toLowerCase())
                  ? "A CRM for landscaping companies, kept simple enough to ship from chat."
                  : current.purpose,
                features: [
                  friendlyTitle(trimmed, selection),
                  ...current.features.filter(
                    (item) => item !== friendlyTitle(trimmed, selection),
                  ),
                ].slice(0, 8),
              }));
              setThreads((current) =>
                current.map((thread) =>
                  thread.id !== activeId
                    ? thread
                    : {
                        ...thread,
                        messages: thread.messages.map((message) =>
                          message.id !== assistantId
                            ? message
                            : {
                                ...message,
                                content:
                                  kind === "fix"
                                    ? "Preview is working again."
                                    : "Preview updated successfully.",
                                blocks: [
                                  ...(message.blocks ?? []),
                                  ...(kind === "fix" || kind === "refine"
                                    ? []
                                    : [suggestionsFor(trimmed)]),
                                ],
                              },
                        ),
                      },
                ),
              );
            }
          }, 700 * (index + 1));
        }
      }

      if (kind === "connect") {
        const service = connectService(trimmed);
        setMemory((current) => ({
          ...current,
          integrations: current.integrations.includes(service.service)
            ? current.integrations
            : [...current.integrations, service.service],
        }));
      }

      setDrafting(false);
      if (view === "browser") {
        pushTarget({
          product,
          view: "browser",
          spaceId: null,
          threadId: activeId,
          projectId: null,
          platformNav,
          panelMode: "collapsed",
          panelIntent: "browse",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }
      const keepSpace =
        (view === "space" || Boolean(opts?.space)) &&
        (PRIMARY_NAV_SPACES as readonly string[]).includes(space);
      setView(keepSpace ? "space" : "chat");
      setSpaceId(space);
      setProjectId(space === "skills" ? null : (intent.projectId ?? null));
      setSkillId(opts?.skillId ?? (space === "skills" ? "sk-brand" : null));
      setPanelIntent("execute");
      setConnectorId(intent.connectorId ?? null);
      setJobId(intent.jobId ?? null);
      if (intent.buildTool) setBuildTool(intent.buildTool);
      if (space === "studio") setStudioTool("canvas");
      if (space === "research") setResearchTool("browser");
      if (space === "skills") setSkillsTool("editor");
      if (kind === "build" || kind === "refine" || kind === "fix") setBuildTool("preview");
      if (kind === "changes") setBuildTool("activity");
      setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
      setMobileSurface("chat");
      pushTarget({
        product,
        view: keepSpace ? "space" : "chat",
        spaceId: space,
        threadId: activeId,
        projectId: space === "skills" ? null : (intent.projectId ?? null),
        platformNav,
        panelMode: "split",
        panelIntent: "execute",
        connectorId: intent.connectorId ?? null,
        jobId: intent.jobId ?? null,
        skillId: opts?.skillId ?? (space === "skills" ? "sk-brand" : null),
      });
    },
    [
      threadId,
      workspaceId,
      spaceId,
      projectId,
      view,
      product,
      platformNav,
      pushTarget,
      selectedId,
      checkpoints,
      memory,
      liveUrl,
      project?.name,
      billingPlan,
      personalSpaceEnabled,
      workspacePolicies,
    ],
  );

  const sendPlatformMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const intent = inferPlatformIntent(trimmed);
      const nav =
        intent.nav && entitlements.platformNavAllowed(intent.nav)
          ? intent.nav
          : undefined;
      const reply =
        intent.nav && !nav
          ? "Models, docs, logs, and usage start on Max. Pro includes APIs, keys, and hosting on one model."
          : intent.reply;
      if (nav) setPlatformNav(nav);

      const userMsg: Message = {
        id: nextId("u"),
        role: "user",
        content: trimmed,
        at: nowTime(),
      };
      const assistantMsg: Message = {
        id: nextId("a"),
        role: "assistant",
        content: reply,
        at: nowTime(),
      };

      const activeIdRef = { id: platformThreadId ?? "" };
      const targetNav = nav ?? platformNav;

      setThreads((current) => {
        const { threads: list, id } = upsertPersistentPlatformThread(
          current,
          workspaceId,
          targetNav,
        );
        activeIdRef.id = id;
        const existing = list.find(
          (item) => item.id === id && item.product === "platform",
        );
        if (existing) {
          return list.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  title: item.messages.length ? item.title : trimmed.slice(0, 52),
                  snippet: trimmed,
                  updatedAt: "Just now",
                  platformNav: targetNav,
                  persistent: true,
                  sessionSummary: null,
                  messages: [...item.messages, userMsg, assistantMsg],
                }
              : item,
          );
        }
        const created: Thread = {
          id,
          title: trimmed.slice(0, 52),
          workspaceId,
          product: "platform",
          platformNav: targetNav,
          updatedAt: "Just now",
          snippet: trimmed,
          messages: [userMsg, assistantMsg],
          persistent: true,
          sessionSummary: null,
        };
        return [created, ...list];
      });
      setPlatformThreadId(activeIdRef.id);
      setPlatformDockOpen(true);
    },
    [platformThreadId, workspaceId, setPlatformNav, entitlements, platformNav],
  );

  const selectElement = useCallback((id: PreviewNodeId) => {
    setSelectedId(id);
    setSelectMode(true);
  }, []);

  const restoreCheckpoint = useCallback((id: string) => {
    setCheckpoints((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) return current;
      return current.slice(index);
    });
    setPreviewKey((value) => value + 1);
    setBuildTool("preview");
  }, []);

  const refreshPreview = useCallback(() => {
    setPreviewKey((value) => value + 1);
  }, []);

  const fillSecret = useCallback((keyName: string, value: string) => {
    if (!value.trim()) return;
    setThreads((current) =>
      current.map((thread) =>
        thread.id !== threadId
          ? thread
          : {
              ...thread,
              messages: thread.messages.map((message) => ({
                ...message,
                blocks: message.blocks?.map((block) =>
                  block.type === "secret" && block.keyName === keyName
                    ? { ...block, filled: true }
                    : block,
                ),
              })),
            },
      ),
    );
  }, [threadId]);

  const publishApp = useCallback((url: string) => {
    setLiveUrl(url);
    setOverlay(null);
    setBuildTool("preview");
    setThreads((current) =>
      current.map((thread) =>
        thread.id !== threadId
          ? thread
          : {
              ...thread,
              messages: [
                ...thread.messages,
                {
                  id: nextId("a"),
                  role: "assistant" as const,
                  content: "Your app is live.",
                  at: nowTime(),
                  blocks: [{ type: "deploy" as const, url, status: "live" as const }],
                },
              ],
            },
      ),
    );
  }, [threadId]);

  const openSpace = useCallback((id: SpaceId) => {
    const allowed = memberSpaces(workspaceId, actor.id, workspacePolicies);
    const opts = { billingPlan, personalEnabled: personalSpaceEnabled };
    let target: SpaceId | null = id;
    if (
      (id === "personal" || id === "finances" || id === "health") &&
      !spaceAllowed("personal", allowed, opts)
    ) {
      target = null;
    }
    if (target && !spaceAllowed(target, allowed, opts)) {
      target = null;
    }
    if (!target) {
      const fallback = (
        ["build", "studio", "research", "personal", "work"] as const
      ).find((space) => spaceAllowed(space, allowed, opts));
      if (!fallback) {
        newChat();
        return;
      }
      target = fallback;
    }
    setView("space");
    setSpaceId(target);
    setProjectId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setConnectorId(null);
    setJobId(null);
    setPanelMode("collapsed");
    setMobileNav(false);
    setMobileSurface("chat");
    // Keep persistent space threads in memory; only detach the active pointer.
    setThreadId(null);
    pushTarget({
      product,
      view: "space",
      spaceId: target,
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [
    product,
    platformNav,
    pushTarget,
    workspaceId,
    workspacePolicies,
    billingPlan,
    personalSpaceEnabled,
    newChat,
    actor.id,
  ]);

  const openRecents = useCallback(() => {
    setView("recents");
    setSpaceId(null);
    setProjectId(null);
    setThreadId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "recents",
      spaceId: null,
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [product, platformNav, pushTarget]);

  useEffect(() => {
    if (entitlements.hasVoice) return;
    setVoiceActive(false);
  }, [entitlements.hasVoice]);

  useEffect(() => {
    if (panelMode !== "collapsed") return;
    if (!drafting || threadId) return;
    setDrafting(false);
    setPanelIntent("browse");
  }, [panelMode, drafting, threadId]);

  useEffect(() => {
    if (entitlements.canAccessDevelopment) return;
    if (product === "platform") persistProduct("courier");
  }, [entitlements.canAccessDevelopment, product]);

  useEffect(() => {
    if (entitlements.hostingAllowed(hostingMode)) return;
    persistHosting("cloud");
  }, [entitlements, hostingMode]);

  useEffect(() => {
    if (product !== "platform") return;
    if (entitlements.platformNavAllowed(platformNav)) return;
    setPlatformNavState("overview");
  }, [entitlements, product, platformNav]);

  useEffect(() => {
    const home = homeWorkspaceId(actor, entitlements);
    const allowed = new Set(
      actor.workspaceIds.concat(
        entitlements.canManageWorkspaces
          ? workspaceCatalog
              .filter((item) => !item.personal)
              .map((item) => item.id)
          : [],
      ),
    );
    if (entitlements.canManageWorkspaces) {
      workspaceCatalog
        .filter((item) => !item.personal)
        .forEach((item) => allowed.add(item.id));
    }
    if (!allowed.has(workspaceId)) persistWorkspace(home);
  }, [actor, entitlements, workspaceId, workspaceCatalog]);

  useEffect(() => {
    if (product !== "courier") return;
    const gated =
      spaceId === "work" ||
      spaceId === "personal" ||
      spaceId === "finances" ||
      spaceId === "health";
    if (!gated || !spaceId) return;
    const allowed = memberSpaces(
      workspaceId,
      actor.id,
      workspacePolicies,
    );
    const opts = { billingPlan, personalEnabled: personalSpaceEnabled };
    const check = spaceId === "work" ? "work" : "personal";
    if (spaceAllowed(check, allowed, opts)) return;
    openSpace(spaceId);
  }, [
    product,
    spaceId,
    workspaceId,
    workspacePolicies,
    billingPlan,
    personalSpaceEnabled,
    openSpace,
  ]);

  const isPinned = useCallback(
    (kind: PinKind, id: string) =>
      pins.some((item) => item.kind === kind && item.id === id),
    [pins],
  );

  const togglePin = useCallback((kind: PinKind, id: string) => {
    toggleStoredPin(kind, id);
  }, []);

  const reorderPins = useCallback(
    (
      from: { kind: PinKind; id: string },
      to: { kind: PinKind; id: string },
    ) => {
      reorderStoredPins(from, to);
    },
    [],
  );

  const moveNavItem = useCallback(
    (id: SidebarNavId, dir: -1 | 1) => {
      persistMoveSidebarNav(
        id,
        memberSpaces(workspaceId, actor.id, workspacePolicies),
        dir,
        { billingPlan, personalEnabled: personalSpaceEnabled },
      );
    },
    [workspaceId, workspacePolicies, billingPlan, personalSpaceEnabled],
  );

  const openProject = useCallback((id: string) => {
    const match = projects.find((item) => item.id === id);
    if (!match) return;
    if (match.workspaceId !== workspaceId) persistWorkspace(match.workspaceId);
    setView("chat");
    setProjectId(match.id);
    setSpaceId(match.space);
    setThreadId(null);
    setDrafting(true);
    setPanelIntent("execute");
    if (match.space === "build") setBuildTool("preview");
    if (match.space === "studio") setStudioTool("canvas");
    if (match.space === "research") setResearchTool("browser");
    setPanelMode("split");
    setMobileSurface("chat");
    setMobileNav(false);
    pushTarget({
      product,
      view: "chat",
      spaceId: match.space,
      threadId: null,
      projectId: match.id,
      platformNav,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [workspaceId, product, platformNav, pushTarget]);

  const openThread = useCallback(
    (id: string) => {
      const found = threads.find((item) => item.id === id);
      if (!found) return;
      if (found.workspaceId !== workspaceId) {
        persistWorkspace(found.workspaceId);
      }
      if (found.product === "platform") {
        if (!entitlements.canAccessDevelopment) return;
        persistProduct("platform");
        setPlatformThreadId(found.id);
        setPlatformDockOpen(true);
        setMobileNav(false);
        pushTarget({
          product: "platform",
          view,
          spaceId,
          threadId,
          projectId,
          platformNav: product === "platform" ? platformNav : "recents",
          panelMode: "split",
          panelIntent,
          connectorId,
          jobId,
          skillId,
        });
        return;
      }
      persistProduct("courier");
      setThreadId(found.id);
      setSpaceId(found.spaceId ?? null);
      setProjectId(found.projectId ?? null);
      setDrafting(false);
      setPanelIntent("execute");
      setView("chat");
      if (found.spaceId === "skills") setSkillsTool("editor");
      if (found.spaceId === "studio") setStudioTool("canvas");
      if (found.spaceId === "research") setResearchTool("browser");
      if (found.spaceId === "build") setBuildTool("preview");
      setPanelMode("split");
      setMobileSurface("chat");
      setMobileNav(false);
      pushTarget({
        product: "courier",
        view: "chat",
        spaceId: found.spaceId ?? null,
        threadId: found.id,
        projectId: found.projectId ?? null,
        platformNav,
        panelMode: "split",
        panelIntent: "execute",
        connectorId: null,
        jobId: null,
        skillId: found.spaceId === "skills" ? "sk-brand" : null,
      });
    },
    [
      threads,
      workspaceId,
      product,
      view,
      spaceId,
      threadId,
      projectId,
      platformNav,
      panelMode,
      panelIntent,
      connectorId,
      jobId,
      skillId,
      pushTarget,
      billingPlan,
    ],
  );

  const openProjectChat = useCallback(
    (id: string) => {
      const match = projects.find((item) => item.id === id);
      if (!match) return;
      const linked = latestThreadForProject(threads, match);
      if (linked) {
        openThread(linked.id);
        return;
      }
      openProject(id);
    },
    [threads, openThread, openProject],
  );

  const openShared = useCallback(() => {
    setView("shared");
    setPanelMode("collapsed");
    setPanelIntent("browse");
    setSpaceId(null);
    setMobileNav(false);
  }, []);

  const openSettings = useCallback((tab?: SettingsTab) => {
    setSettingsTab(
      tab ?? (entitlements.showOrgSettings ? "organization" : "plans"),
    );
    setOverlay("settings");
    setMobileNav(false);
  }, [entitlements.showOrgSettings]);

  const openOverlay = useCallback((id: OverlayId) => {
    setOverlay(id);
    setMobileNav(false);
  }, []);

  const openSpaceSettings = useCallback((space: SpaceId) => {
    setSettingsSpaceId(space);
    setOverlay("space-settings");
    setMobileNav(false);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setSettingsSpaceId(null);
  }, []);

  const toggleVoice = useCallback(() => {
    if (!entitlements.hasVoice) return;
    setVoiceActive((on) => !on);
  }, [entitlements.hasVoice]);

  const openBrowser = useCallback((opts?: { chat?: boolean; query?: string }) => {
    const query = opts?.query?.trim() || null;
    setView("browser");
    setSpaceId("research");
    setThreadId(null);
    setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setDrafting(Boolean(opts?.chat));
    setBrowserChatOpen(Boolean(opts?.chat));
    setBrowserSearch(query);
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "browser",
      spaceId: "research",
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [product, platformNav, pushTarget]);

  const clearPageReference = useCallback(() => setPageReference(null), []);

  const attachBrowserReference = useCallback(() => {
    setPageReference(browserPage);
  }, [browserPage]);

  const referencePageInSpace = useCallback(
    (target: SpaceId) => {
      setPageReference(browserPage);
      setView("chat");
      setSpaceId(target);
      setProjectId(null);
      setThreadId(null);
      setDrafting(true);
      setPanelIntent("execute");
      setPanelMode("split");
      setMobileSurface("chat");
      if (target === "build") setBuildTool("preview");
      if (target === "studio") setStudioTool("canvas");
      if (target === "research") setResearchTool("browser");
      setMobileNav(false);
    },
    [browserPage],
  );

  const spaceLibraryOpen =
    panelMode !== "collapsed" &&
    panelIntent === "browse" &&
    !projectId &&
    !!spaceId &&
    isSpaceLibrarySpace(spaceId);

  const toggleSpaceLibrary = useCallback(() => {
    if (!spaceId || !isSpaceLibrarySpace(spaceId)) return;
    if (spaceLibraryOpen) {
      setPanelMode("collapsed");
      return;
    }
    setPanelIntent("browse");
    setPanelMode("split");
  }, [spaceId, spaceLibraryOpen]);

  const openConnector = useCallback((id: string) => {
    setView("chat");
    setSpaceId("connectors");
    setConnectorId(id);
    setThreadId(null);
    setDrafting(true);
    setPanelIntent("execute");
    setPanelMode("split");
    setMobileSurface("chat");
    setMobileNav(false);
    pushTarget({
      product,
      view: "chat",
      spaceId: "connectors",
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: id,
      jobId: null,
      skillId: null,
    });
  }, [product, platformNav, pushTarget]);

  const openJob = useCallback((id: string) => {
    setView("chat");
    setSpaceId("build");
    setJobId(id);
    setThreadId(null);
    setDrafting(true);
    setPanelIntent("execute");
    setPanelMode("split");
    setMobileSurface("chat");
    setMobileNav(false);
    pushTarget({
      product,
      view: "chat",
      spaceId: "build",
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: null,
      jobId: id,
      skillId: null,
    });
  }, [product, platformNav, pushTarget]);

  const openSkill = useCallback((id: string) => {
    setView("chat");
    setSpaceId("build");
    setSkillId(id);
    setThreadId(null);
    setDrafting(true);
    setPanelIntent("execute");
    setSkillsTool("editor");
    setPanelMode("split");
    setMobileSurface("chat");
    setMobileNav(false);
    pushTarget({
      product,
      view: "chat",
      spaceId: "build",
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: null,
      jobId: null,
      skillId: id,
    });
  }, [product, platformNav, pushTarget]);

  const openFile = useCallback((id: string) => {
    setView("space");
    setSpaceId("studio");
    setFileId(id);
    setThreadId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "space",
      spaceId: "studio",
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [product, platformNav, pushTarget]);

  const value = useMemo(
    () => ({
      product,
      setProduct,
      hostingMode,
      setHostingMode,
      actor,
      actorId,
      setActor,
      setPreview,
      entitlements,
      billingPlan,
      setBillingPlan,
      personalSpaceEnabled,
      setPersonalSpaceEnabled,
      workspacePolicies,
      orgMembers,
      workspaceId,
      setWorkspace,
      workspace,
      view,
      threads,
      threadId,
      thread,
      platformThreadId,
      spaceId,
      projectId,
      project,
      pins,
      sidebarLayout,
      panelMode,
      panelIntent,
      panelRatio,
      setPanelRatio,
      setPanelMode,
      setPanelIntent,
      mobileSurface,
      setMobileSurface,
      sidebarOpen,
      setSidebarOpen,
      workspaceRailOpen,
      setWorkspaceRailOpen,
      toggleLeftPanel,
      mobileNav,
      setMobileNav,
      dragging,
      setDragging,
      drafting,
      buildTool,
      setBuildTool,
      studioTool,
      setStudioTool,
      researchTool,
      setResearchTool,
      skillsTool,
      setSkillsTool,
      skillId,
      fileId,
      connectorId,
      jobId,
      scheduledFilter,
      setScheduledFilter,
      settingsTab,
      setSettingsTab,
      platformNav,
      setPlatformNav,
      spaceLayout,
      setSpaceLayout,
      overlay,
      settingsSpaceId,
      openOverlay,
      openSpaceSettings,
      closeOverlay,
      newChat,
      openSpaceChat,
      setChatSpace,
      armChatInterface,
      collapseDraft,
      closeSpaceChat,
      clearSessionSummary,
      updateSessionSummary,
      clearPersistentChat,
      sendMessage,
      platformMessages,
      sendPlatformMessage,
      platformDockOpen,
      setPlatformDockOpen,
      openSpace,
      openRecents,
      openBrowser,
      browserChatOpen,
      setBrowserChatOpen,
      browserChatRatio,
      setBrowserChatRatio,
      browserPage,
      setBrowserPage,
      browserSearch,
      pageReference,
      setPageReference,
      clearPageReference,
      attachBrowserReference,
      referencePageInSpace,
      spaceLibraryOpen,
      toggleSpaceLibrary,
      isPinned,
      togglePin,
      reorderPins,
      moveSidebarNav: moveNavItem,
      openProject,
      openProjectChat,
      openThread,
      openShared,
      openSettings,
      openConnector,
      openJob,
      openSkill,
      openFile,
      voiceActive,
      voiceAnchor,
      toggleVoice,
      setVoiceAnchor,
      canGoBack: hist.i > 0,
      canGoForward: hist.i < hist.stack.length - 1,
      goBack,
      goForward,
      advancedMode,
      setAdvancedMode,
      viewport,
      setViewport,
      selectMode,
      setSelectMode,
      selectedId,
      hoveredId,
      setHoveredId,
      selectElement,
      checkpoints,
      restoreCheckpoint,
      previewKey,
      refreshPreview,
      liveUrl,
      memory,
      fillSecret,
      publishApp,
    }),
    [
      product,
      setProduct,
      hostingMode,
      setHostingMode,
      actor,
      actorId,
      setActor,
      setPreview,
      entitlements,
      billingPlan,
      setBillingPlan,
      personalSpaceEnabled,
      setPersonalSpaceEnabled,
      workspacePolicies,
      orgMembers,
      workspaceId,
      setWorkspace,
      workspace,
      view,
      threads,
      threadId,
      thread,
      platformThreadId,
      spaceId,
      projectId,
      project,
      pins,
      sidebarLayout,
      panelMode,
      panelIntent,
      panelRatio,
      mobileSurface,
      sidebarOpen,
      workspaceRailOpen,
      toggleLeftPanel,
      mobileNav,
      dragging,
      drafting,
      buildTool,
      studioTool,
      researchTool,
      skillsTool,
      skillId,
      fileId,
      connectorId,
      jobId,
      scheduledFilter,
      settingsTab,
      platformNav,
      setPlatformNav,
      spaceLayout,
      overlay,
      settingsSpaceId,
      openOverlay,
      openSpaceSettings,
      closeOverlay,
      newChat,
      openSpaceChat,
      setChatSpace,
      armChatInterface,
      collapseDraft,
      closeSpaceChat,
      clearSessionSummary,
      updateSessionSummary,
      clearPersistentChat,
      sendMessage,
      platformMessages,
      sendPlatformMessage,
      platformDockOpen,
      openSpace,
      openRecents,
      openBrowser,
      browserChatOpen,
      setBrowserChatOpen,
      browserChatRatio,
      setBrowserChatRatio,
      browserPage,
      setBrowserPage,
      browserSearch,
      pageReference,
      setPageReference,
      clearPageReference,
      attachBrowserReference,
      referencePageInSpace,
      spaceLibraryOpen,
      toggleSpaceLibrary,
      isPinned,
      togglePin,
      reorderPins,
      moveNavItem,
      openProject,
      openProjectChat,
      openThread,
      openShared,
      openSettings,
      openConnector,
      openJob,
      openSkill,
      openFile,
      voiceActive,
      voiceAnchor,
      toggleVoice,
      setVoiceAnchor,
      hist,
      goBack,
      goForward,
      advancedMode,
      viewport,
      selectMode,
      selectedId,
      hoveredId,
      selectElement,
      checkpoints,
      restoreCheckpoint,
      previewKey,
      refreshPreview,
      liveUrl,
      memory,
      fillSecret,
      publishApp,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
