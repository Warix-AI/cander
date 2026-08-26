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
  deleteWorkspace as deleteCustomWorkspace,
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  isCustomWorkspace,
  subscribeWorkspaceCatalog,
  workspaceById,
} from "@/lib/workspace-catalog";
import { workspaceKindOf } from "@/lib/workspace-kind";
import { inferIntent, nextId } from "@/lib/intent";
import { latestThreadForProject } from "@/lib/selectors";
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
  getWorkspaceServerSnapshot,
  getWorkspaceSnapshot,
  persistActor,
  persistHosting,
  persistPersonalSpace,
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
  subscribeSidebar,
  subscribeWorkspace,
  removeStoredPin,
  reorderStoredPins,
  setStoredPin,
  toggleStoredPin,
} from "@/lib/session";
import {
  getMembersServerSnapshot,
  getMembersSnapshot,
  getPoliciesServerSnapshot,
  getPoliciesSnapshot,
  memberSpaces,
  purgeWorkspace,
  subscribePolicies,
} from "@/lib/workspace-policy";
import { clearWorkspaceConnections } from "@/lib/workspace-connections";
import { clearWorkspaceIcon } from "@/lib/workspace-icons";
import {
  entitlementsFor,
  homeWorkspaceId,
  workspacesFor,
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
  MobileMenuScreen,
  OverlayId,
  PageReference,
  PanelIntent,
  PanelMode,
  Pin,
  PinKind,
  PinTier,
  PreviewNodeId,
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
  ensureContinuousChat,
  startContinuousChat,
  summarizeSession,
} from "@/lib/persistent-chat";

type Snapshot = {
  view: CourierView;
  spaceId: SpaceId | null;
  threadId: string | null;
  projectId: string | null;
  panelMode: PanelMode;
  panelIntent: PanelIntent;
  connectorId: string | null;
  jobId: string | null;
  skillId: string | null;
};

function sameSnap(a: Snapshot, b: Snapshot) {
  return (
    a.view === b.view &&
    a.spaceId === b.spaceId &&
    a.threadId === b.threadId &&
    a.projectId === b.projectId
  );
}

type SendOpts = {
  space?: SpaceId;
  skillId?: string;
};

type AppContextValue = {
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
  removeWorkspace: (id: string) => boolean;
  workspace: Workspace;
  view: CourierView;
  threads: Thread[];
  threadId: string | null;
  thread: Thread | null;
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
  mobileMenuScreen: MobileMenuScreen;
  setMobileMenuScreen: (screen: MobileMenuScreen) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  workspaceRailOpen: boolean;
  setWorkspaceRailOpen: (open: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
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
  settingsMobileHub: boolean;
  setSettingsMobileHub: (hub: boolean) => void;
  backToSettingsHub: () => void;
  settingsWorkspaceId: string | null;
  setSettingsWorkspaceId: (id: string | null) => void;
  closeSettings: () => void;
  spaceLayout: SpaceLayout;
  setSpaceLayout: (layout: SpaceLayout) => void;
  overlay: OverlayId;
  settingsSpaceId: SpaceId | null;
  openOverlay: (id: OverlayId) => void;
  openSpaceSettings: (space: SpaceId) => void;
  closeOverlay: () => void;
  newChat: (space?: SpaceId) => void;
  /** Courier home chat — empty chat home. */
  openCourierHome: () => void;
  /** Resume (or create) the persistent dock chat for a space. */
  openSpaceChat: (space: SpaceId) => void;
  setChatSpace: (id: SpaceId | null) => void;
  armChatInterface: (id: SpaceId) => void;
  /** Attach a space panel to the current chat without switching threads. */
  selectChatSpace: (
    id: SpaceId,
    opts?: { researchTool?: ResearchTool },
  ) => void;
  collapseDraft: () => void;
  /** Close space chat and restore the full workspace dashboard. */
  closeSpaceChat: () => void;
  clearSessionSummary: (threadId?: string | null) => void;
  updateSessionSummary: (text: string, threadId?: string | null) => void;
  clearPersistentChat: (threadId?: string | null) => void;
  sendMessage: (text: string, opts?: SendOpts) => void;
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
  pinTier: (kind: PinKind, id: string) => PinTier | null;
  setPin: (kind: PinKind, id: string, tier: PinTier) => void;
  clearPin: (kind: PinKind, id: string) => void;
  /** Pin or unpin. New pins use the single Pinned list. */
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
  /** Clear project/entity and return to the space directory on mobile/desktop. */
  backToSpaceHome: () => void;
  openThread: (id: string) => void;
  openShared: () => void;
  openSettings: (tab?: SettingsTab, opts?: { hub?: boolean }) => void;
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
  const [mobileMenuScreen, setMobileMenuScreen] =
    useState<MobileMenuScreen>("main");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceRailOpen, setWorkspaceRailOpen] = useState(true);
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
  const [settingsMobileHub, setSettingsMobileHub] = useState(true);
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(
    null,
  );
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
    stack: "Next.js, TypeScript, Live Preview",
    integrations: [],
    features: [],
    rejected: [],
  });
  const [hist, setHist] = useState<{ stack: Snapshot[]; i: number }>({
    stack: [
      {
        view: "chat",
        spaceId: null,
        threadId: null,
        projectId: null,
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
    setView(snap.view);
    setSpaceId(snap.spaceId);
    setThreadId(snap.threadId);
    setProjectId(snap.projectId);
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

  const setWorkspace = useCallback(
    (id: string) => {
      if (id === workspaceId) {
        return;
      }

      const prevView = view;
      const prevSpace = spaceId;
      const chatWasOpen =
        panelMode !== "collapsed" && (drafting || Boolean(threadId));

      persistWorkspace(id);
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setThreadId(null);
      setOverlay(null);
      setMobileSurface((surface) => (surface === "menu" ? surface : "chat"));

      const allowed = memberSpaces(id, actor.id, workspacePolicies);
      const opts = { billingPlan, personalEnabled: personalSpaceEnabled };

      // Global surfaces that aren't space-scoped — keep them.
      if (
        prevView === "recents" ||
        prevView === "browser" ||
        prevView === "shared" ||
        prevView === "settings"
      ) {
        setView(prevView);
        setSpaceId(null);
        setDrafting(false);
        setPanelMode("collapsed");
        setPanelIntent("browse");
        pushTarget({
          view: prevView,
          spaceId: null,
          threadId: null,
          projectId: null,
          panelMode: "collapsed",
          panelIntent: "browse",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }

      const canKeepSpace =
        Boolean(prevSpace) && spaceAllowed(prevSpace!, allowed, opts);

      if (canKeepSpace && prevSpace) {
        setView("space");
        setSpaceId(prevSpace);
        if (prevSpace === "build") setBuildTool("preview");
        if (prevSpace === "studio") setStudioTool("canvas");
        if (prevSpace === "research") setResearchTool("browser");
        if (prevSpace === "skills") setSkillsTool("editor");

        if (chatWasOpen && isChatSpace(prevSpace)) {
          let tid = "";
          let hasMessages = false;
          setThreads((current) => {
            const { threads: next, id: nextId } = ensureContinuousChat(
              current,
              id,
              prevSpace,
            );
            tid = nextId;
            hasMessages = Boolean(
              next
                .find((item) => item.id === nextId)
                ?.messages.some(
                  (msg) => msg.role === "user" || msg.role === "assistant",
                ),
            );
            return next;
          });
          setThreadId(tid);
          setDrafting(!hasMessages);
          setPanelMode("split");
          setPanelIntent("execute");
          pushTarget({
            view: "space",
            spaceId: prevSpace,
            threadId: tid,
            projectId: null,
            panelMode: "split",
            panelIntent: "execute",
            connectorId: null,
            jobId: null,
            skillId: null,
          });
          return;
        }

        setDrafting(false);
        setPanelMode("collapsed");
        setPanelIntent("browse");
        pushTarget({
          view: "space",
          spaceId: prevSpace,
          threadId: null,
          projectId: null,
          panelMode: "collapsed",
          panelIntent: "browse",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }

      // Target workspace doesn't have this space — home New chat.
      setView("chat");
      setSpaceId(null);
      setDrafting(false);
      setPanelMode("collapsed");
      setPanelIntent("browse");
      pushTarget({
        view: "chat",
        spaceId: null,
        threadId: null,
        projectId: null,
        panelMode: "collapsed",
        panelIntent: "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [
      workspaceId,
      view,
      spaceId,
      panelMode,
      drafting,
      threadId,
      actor.id,
      workspacePolicies,
      billingPlan,
      personalSpaceEnabled,
      pushTarget,
    ],
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      if (!isCustomWorkspace(id)) return false;

      const allowed = workspacesFor(actor, entitlements);
      if (!allowed.some((item) => item.id === id)) return false;

      const target = allowed.find((item) => item.id === id);
      if (
        target &&
        workspaceKindOf(target) === "business" &&
        !entitlements.canManageWorkspaces
      ) {
        return false;
      }

      if (!deleteCustomWorkspace(id)) return false;

      purgeWorkspace(id);
      clearWorkspaceConnections(id);
      clearWorkspaceIcon(id);

      if (workspaceId === id) {
        const nextId = homeWorkspaceId(actor, entitlements);
        setWorkspace(nextId);
      }

      return true;
    },
    [actor, entitlements, workspaceId, setWorkspace],
  );

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

  const toggleLeftPanel = useCallback(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!desktop) return;

    const canRail =
      entitlements.hasWorkspaces &&
      !entitlements.showInviteWall &&
      workspacesFor(actor, entitlements).length >= 2;

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
  }, [
    sidebarOpen,
    workspaceRailOpen,
    actor,
    entitlements,
  ]);

  const toggleRightPanel = useCallback(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!desktop) {
      setPanelMode((mode) => {
        if (mode === "collapsed") return "split";
        return mode;
      });
      setMobileSurface((surface) => {
        // Opening from collapsed always lands on panel.
        if (panelMode === "collapsed") return "panel";
        return surface === "panel" ? "chat" : "panel";
      });
      return;
    }
    setPanelMode((mode) => (mode === "collapsed" ? "split" : "collapsed"));
    setMobileSurface("chat");
  }, [panelMode]);

  const openSpaceChat = useCallback(
    (space: SpaceId) => {
      if (!isChatSpace(space)) return;
      let tid = "";
      let hasMessages = false;
      setThreads((current) => {
        const { threads: next, id } = ensureContinuousChat(
          current,
          workspaceId,
          space,
          threadId,
        );
        tid = id;
        hasMessages = Boolean(
          next
            .find((item) => item.id === id)
            ?.messages.some(
              (msg) => msg.role === "user" || msg.role === "assistant",
            ),
        );
        return next;
      });
      setThreadId(tid);
      setSpaceId(space);
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setView("space");
      setPanelIntent("execute");
      setPanelMode("split");
      setMobileSurface((surface) => (surface === "menu" ? "chat" : surface));
      setDrafting(!hasMessages);
      if (space === "build") setBuildTool("preview");
      if (space === "studio") setStudioTool("canvas");
      if (space === "research") setResearchTool("browser");
      if (space === "skills") setSkillsTool("editor");
      pushTarget({
        view: "space",
        spaceId: space,
        threadId: tid,
        projectId: null,
        panelMode: "split",
        panelIntent: "execute",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [workspaceId, threadId, pushTarget],
  );

  const newChat = useCallback(
    (space?: SpaceId) => {
      if (space && isChatSpace(space)) {
        let tid = "";
        setThreads((current) => {
          const started = startContinuousChat(current, workspaceId, space);
          tid = started.id;
          return started.threads;
        });
        setThreadId(tid);
        setSpaceId(space);
        setProjectId(null);
        setConnectorId(null);
        setJobId(null);
        setSkillId(null);
        setView("space");
        setDrafting(true);
        setPanelIntent("execute");
        setPanelMode("split");
        setMobileSurface("chat");
        if (space === "build") setBuildTool("preview");
        if (space === "studio") setStudioTool("canvas");
        if (space === "research") setResearchTool("browser");
        if (space === "skills") setSkillsTool("editor");
        pushTarget({
          view: "space",
          spaceId: space,
          threadId: tid,
          projectId: null,
          panelMode: "split",
          panelIntent: "execute",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }

      setThreadId(null);
      setSpaceId(null);
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setView("chat");
      setDrafting(false);
      setPanelIntent("browse");
      setPanelMode("collapsed");
      pushTarget({
        view: "chat",
        spaceId: null,
        threadId: null,
        projectId: null,
        panelMode: "collapsed",
        panelIntent: "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [pushTarget, workspaceId],
  );

  const openCourierHome = useCallback(() => {
    newChat();
  }, [newChat]);

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
        const { threads: next, id: nextId } = ensureContinuousChat(
          current,
          workspaceId,
          id,
          threadId,
        );
        tid = nextId;
        hasMessages = Boolean(
          next
            .find((item) => item.id === nextId)
            ?.messages.some(
              (msg) => msg.role === "user" || msg.role === "assistant",
            ),
        );
        return next;
      });
      setThreadId(tid);
      setDrafting(!hasMessages);
      setView("space");
      setSpaceId(id);
      setPanelIntent("execute");
      setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
      setMobileSurface((surface) => (surface === "menu" ? "chat" : surface));
      if (id === "build") setBuildTool("preview");
      if (id === "studio") setStudioTool("canvas");
      if (id === "research") setResearchTool("browser");
      if (id === "skills") setSkillsTool("editor");
    },
    [workspaceId, threadId],
  );

  const selectChatSpace = useCallback(
    (id: SpaceId, opts?: { researchTool?: ResearchTool }) => {
      if (!isChatSpace(id)) return;
      setView("chat");
      setSpaceId(id);
      setPanelIntent("execute");
      setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
      setMobileSurface((surface) => (surface === "menu" ? "chat" : surface));
      if (id === "build") setBuildTool("preview");
      if (id === "studio") setStudioTool("canvas");
      if (id === "research")
        setResearchTool(opts?.researchTool ?? "browser");
      if (id === "skills") setSkillsTool("editor");
      if (threadId) {
        setThreads((current) => {
          const existing = current.find((item) => item.id === threadId);
          if (
            existing?.persistent &&
            !existing.projectId &&
            existing.workspaceId === workspaceId
          ) {
            return ensureContinuousChat(
              current,
              workspaceId,
              id,
              threadId,
            ).threads;
          }
          return current.map((item) =>
            item.id === threadId ? { ...item, spaceId: id } : item,
          );
        });
      }
    },
    [threadId, workspaceId],
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
        view: "space",
        spaceId,
        threadId: null,
        projectId: null,
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
    pushTarget,
    threadId,
    summarizeThreadById,
  ]);

  const clearSessionSummary = useCallback(
    (id?: string | null) => {
      const target = id ?? threadId;
      if (!target) return;
      setThreads((current) =>
        current.map((item) =>
          item.id === target ? { ...item, sessionSummary: null } : item,
        ),
      );
    },
    [threadId],
  );

  const updateSessionSummary = useCallback(
    (text: string, id?: string | null) => {
      const target = id ?? threadId;
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
    [threadId],
  );

  const clearPersistentChat = useCallback(
    (id?: string | null) => {
      const target = id ?? threadId;
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
    [threadId],
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
        intent.resolved &&
        isChatSpace(intent.space) &&
        spaceAllowed(intent.space, allowed, planOpts)
          ? intent.space
          : null;
      const entityContext =
        Boolean(connectorId) ||
        Boolean(projectId) ||
        Boolean(jobId) ||
        Boolean(skillId);
      const stayInChat =
        kind !== "chat" ||
        Boolean(currentChat) ||
        Boolean(inferredChat) ||
        !intent.resolved ||
        entityContext ||
        drafting ||
        Boolean(threadId);

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
          view: "space",
          spaceId: dest,
          threadId: null,
          projectId: null,
          panelMode: "collapsed",
          panelIntent: "browse",
          connectorId: intent.connectorId ?? null,
          jobId: intent.jobId ?? null,
          skillId: null,
        });
        return;
      }

      const space =
        inferredChat ??
        currentChat ??
        (connectorId
          ? "connectors"
          : jobId || skillId
            ? "build"
            : project
              ? project.space
              : null) ??
        (intent.resolved ? intent.space : null);
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
              title: "Something went wrong",
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
          content: "We can publish this for you. No build pipeline to manage.",
          blocks: [
            {
              type: "deploy",
              url: liveUrl ?? `https://${slug}.app`,
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
          const upserted = ensureContinuousChat(
            list,
            workspaceId,
            space,
            threadId,
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
                  spaceId: space ?? undefined,
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
          spaceId: space ?? undefined,
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
          view: "browser",
          spaceId: null,
          threadId: activeId,
          projectId: null,
          panelMode: "collapsed",
          panelIntent: "browse",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }
      const keepSpace =
        Boolean(space) &&
        (view === "space" || Boolean(opts?.space)) &&
        (PRIMARY_NAV_SPACES as readonly string[]).includes(space as string) &&
        !entityContext;
      setView(entityContext || !keepSpace ? "chat" : "space");
      setSpaceId(space ?? spaceId);
      setProjectId(
        projectId ??
          (!space || space === "skills" ? null : (intent.projectId ?? null)),
      );
      setSkillId(
        skillId ?? opts?.skillId ?? (space === "skills" ? "sk-brand" : null),
      );
      setPanelIntent("execute");
      setConnectorId(intent.connectorId ?? connectorId);
      setJobId(intent.jobId ?? jobId);
      if (space && intent.buildTool) setBuildTool(intent.buildTool);
      if (space === "studio") setStudioTool("canvas");
      if (space === "research") setResearchTool("browser");
      if (space === "skills") setSkillsTool("editor");
      if (space && (kind === "build" || kind === "refine" || kind === "fix"))
        setBuildTool("preview");
      if (space && kind === "changes") setBuildTool("activity");
      setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
      setMobileSurface("chat");
      pushTarget({
        view: entityContext || !keepSpace ? "chat" : "space",
        spaceId: space ?? spaceId,
        threadId: activeId,
        projectId:
          projectId ??
          (space === "skills" ? null : (intent.projectId ?? null)),
        panelMode: "split",
        panelIntent: "execute",
        connectorId: intent.connectorId ?? connectorId,
        jobId: intent.jobId ?? jobId,
        skillId: skillId ?? opts?.skillId ?? (space === "skills" ? "sk-brand" : null),
      });
    },
    [
      threadId,
      workspaceId,
      spaceId,
      projectId,
      project,
      connectorId,
      jobId,
      skillId,
      view,
      drafting,
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
    const planOpts = { billingPlan, personalEnabled: personalSpaceEnabled };
    let target: SpaceId | null = id === "connectors" ? "connectors" : id;
    if (
      target &&
      (target === "personal" || target === "finances" || target === "health") &&
      !spaceAllowed("personal", allowed, planOpts)
    ) {
      target = null;
    }
    if (target && !spaceAllowed(target, allowed, planOpts)) {
      target = null;
    }
    if (!target) {
      const fallback = (
        ["build", "studio", "research", "personal", "work"] as const
      ).find((space) => spaceAllowed(space, allowed, planOpts));
      if (!fallback) {
        newChat();
        return;
      }
      target = fallback;
    }

    const chatActive = Boolean(threadId) || drafting;
    if (chatActive && target === spaceId) {
      setMobileSurface("chat");
      if (panelMode === "collapsed") {
        setPanelMode("split");
        setPanelIntent("execute");
      }
      return;
    }

    const goToSpace = (dest: SpaceId) => {
      setView("space");
      setSpaceId(dest);
      setProjectId(null);
      setDrafting(false);
      setPanelIntent("browse");
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setPanelMode("collapsed");
      setMobileSurface("panel");
      setThreadId(null);
      pushTarget({
        view: "space",
        spaceId: dest,
        threadId: null,
        projectId: null,
        panelMode: "collapsed",
        panelIntent: "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    };

    goToSpace(target);
  }, [
    pushTarget,
    workspaceId,
    workspacePolicies,
    billingPlan,
    personalSpaceEnabled,
    newChat,
    actor.id,
    threadId,
    drafting,
    spaceId,
    panelMode,
  ]);

  const openRecents = useCallback(() => {
    setView("recents");
    setSpaceId(null);
    setProjectId(null);
    setThreadId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    pushTarget({
      view: "recents",
      spaceId: null,
      threadId: null,
      projectId: null,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [pushTarget]);

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
    if (entitlements.hostingAllowed(hostingMode)) return;
    persistHosting("cloud");
  }, [entitlements, hostingMode]);

  useEffect(() => {
    const home = homeWorkspaceId(actor, entitlements);
    const allowed = new Set(
      actor.workspaceIds.concat(
        entitlements.canManageWorkspaces
          ? workspaceCatalog
              .filter((item) => workspaceKindOf(item) === "business")
              .map((item) => item.id)
          : [],
      ),
    );
    if (entitlements.canManageWorkspaces) {
      workspaceCatalog
        .filter((item) => workspaceKindOf(item) === "business")
        .forEach((item) => allowed.add(item.id));
    }
    if (!allowed.has(workspaceId)) persistWorkspace(home);
  }, [actor, entitlements, workspaceId, workspaceCatalog]);

  useEffect(() => {
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
    spaceId,
    workspaceId,
    workspacePolicies,
    billingPlan,
    personalSpaceEnabled,
    openSpace,
    actor.id,
  ]);

  const isPinned = useCallback(
    (kind: PinKind, id: string) =>
      pins.some((item) => item.kind === kind && item.id === id),
    [pins],
  );

  const pinTier = useCallback(
    (kind: PinKind, id: string): PinTier | null => {
      const match = pins.find((item) => item.kind === kind && item.id === id);
      if (!match) return null;
      return match.tier === "secondary" ? "secondary" : "primary";
    },
    [pins],
  );

  const setPin = useCallback((kind: PinKind, id: string, tier: PinTier) => {
    setStoredPin(kind, id, tier);
  }, []);

  const clearPin = useCallback((kind: PinKind, id: string) => {
    removeStoredPin(kind, id);
  }, []);

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
    const chatActive = Boolean(threadId) || drafting;
    const keepChat = chatActive && projectId === id;
    if (match.workspaceId !== workspaceId) persistWorkspace(match.workspaceId);
    setView("space");
    setProjectId(match.id);
    setSpaceId(match.space);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    if (!keepChat) {
      setThreadId(null);
      setDrafting(true);
    }
    setPanelIntent("execute");
    if (match.space === "build") setBuildTool("preview");
    if (match.space === "studio") setStudioTool("canvas");
    if (match.space === "research") setResearchTool("browser");
    setPanelMode("split");
    setMobileSurface("panel");
    pushTarget({
      view: "space",
      spaceId: match.space,
      threadId: keepChat ? threadId : null,
      projectId: match.id,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [workspaceId, pushTarget, threadId, drafting, projectId]);

  /** Leave a project/entity and return to the space directory on the panel. */
  const backToSpaceHome = useCallback(() => {
    if (!spaceId) return;
    setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setPanelIntent("browse");
    setView("space");
    setMobileSurface("panel");
    // Keep continuous chat armed when a thread exists; otherwise collapse drafting.
    if (!threadId) {
      setDrafting(false);
      setPanelMode("collapsed");
    } else {
      setPanelMode("split");
    }
    pushTarget({
      view: "space",
      spaceId,
      threadId,
      projectId: null,
      panelMode: threadId ? "split" : "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [spaceId, threadId, pushTarget]);

  const openThread = useCallback(
    (id: string) => {
      const found = threads.find((item) => item.id === id);
      if (!found) return;
      if (found.workspaceId !== workspaceId) {
        persistWorkspace(found.workspaceId);
      }
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
      pushTarget({
        view: "chat",
        spaceId: found.spaceId ?? null,
        threadId: found.id,
        projectId: found.projectId ?? null,
        panelMode: "split",
        panelIntent: "execute",
        connectorId: null,
        jobId: null,
        skillId: found.spaceId === "skills" ? "sk-brand" : null,
      });
    },
    [threads, workspaceId, pushTarget],
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
  }, []);

  const openSettings = useCallback((tab?: SettingsTab, opts?: { hub?: boolean }) => {
    setSettingsWorkspaceId(null);
    if (opts?.hub) {
      setSettingsMobileHub(true);
    } else {
      setSettingsMobileHub(false);
      setSettingsTab(
        tab ?? (entitlements.showOrgSettings ? "organization" : "plans"),
      );
    }
    setView("settings");
    setSpaceId(null);
    setProjectId(null);
    setThreadId(null);
    setConnectorId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    setOverlay(null);
    pushTarget({
      view: "settings",
      spaceId: null,
      threadId: null,
      projectId: null,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [entitlements.showOrgSettings, pushTarget]);

  const backToSettingsHub = useCallback(() => {
    setSettingsWorkspaceId(null);
    setSettingsMobileHub(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsWorkspaceId(null);
    setSettingsMobileHub(true);
    if (hist.i > 0) {
      goBack();
      return;
    }
    setThreadId(null);
    setSpaceId(null);
    setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setView("chat");
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    pushTarget({
      view: "chat",
      spaceId: null,
      threadId: null,
      projectId: null,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [hist.i, goBack, pushTarget]);

  const selectSettingsTab = useCallback((tab: SettingsTab) => {
    setSettingsWorkspaceId(null);
    setSettingsTab(tab);
  }, []);

  const openOverlay = useCallback((id: OverlayId) => {
    setOverlay(id);
  }, []);

  const openSpaceSettings = useCallback((space: SpaceId) => {
    setSettingsSpaceId(space);
    setOverlay("space-settings");
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setSettingsSpaceId(null);
  }, []);

  const toggleVoice = useCallback(() => {
    if (!entitlements.hasVoice) return;
    if (voiceActive) {
      setVoiceActive(false);
      const activeThread = threadId
        ? threads.find((item) => item.id === threadId)
        : null;
      const emptySession =
        (!threadId && drafting) ||
        (activeThread !== undefined &&
          activeThread !== null &&
          activeThread.messages.length === 0);
      if (emptySession) {
        newChat();
        return;
      }
      if (threadId) {
        summarizeThreadById(threadId);
        setDrafting(false);
        setPanelMode("collapsed");
        setPanelIntent("browse");
        return;
      }
      setDrafting(false);
      return;
    }

    setVoiceActive(true);

    if (view === "space" && spaceId && isChatSpace(spaceId) && !threadId) {
      openSpaceChat(spaceId);
      return;
    }

    if (!threadId) {
      setView("chat");
      setDrafting(true);
      setPanelIntent("execute");
      setPanelMode("split");
      setMobileSurface("chat");
      pushTarget({
        view: "chat",
        spaceId,
        threadId: null,
        projectId,
        panelMode: "split",
        panelIntent: "execute",
        connectorId,
        jobId,
        skillId,
      });
      return;
    }

    if (!spaceId) {
      setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
    }
  }, [
    entitlements.hasVoice,
    voiceActive,
    threadId,
    threads,
    drafting,
    view,
    spaceId,
    projectId,
    connectorId,
    jobId,
    skillId,
    newChat,
    summarizeThreadById,
    openSpaceChat,
    pushTarget,
  ]);

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
    pushTarget({
      view: "browser",
      spaceId: "research",
      threadId: null,
      projectId: null,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [pushTarget]);

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
    const chatActive = Boolean(threadId) || drafting;
    const keepChat = chatActive && spaceId === "connectors" && connectorId === id;

    setView("chat");
    setSpaceId("connectors");
    setConnectorId(id);
    setProjectId(null);
    setJobId(null);
    setSkillId(null);
    if (!keepChat) {
      setThreadId(null);
      setDrafting(true);
    }
    setPanelIntent("execute");
    setPanelMode("split");
    setMobileSurface("chat");
    pushTarget({
      view: "chat",
      spaceId: "connectors",
      threadId: keepChat ? threadId : null,
      projectId: null,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: id,
      jobId: null,
      skillId: null,
    });
  }, [pushTarget, threadId, drafting, spaceId, connectorId]);

  const openJob = useCallback((id: string) => {
    const chatActive = Boolean(threadId) || drafting;
    const keepChat = chatActive && spaceId === "build" && jobId === id;

    setView("chat");
    setSpaceId("build");
    setJobId(id);
    setConnectorId(null);
    setProjectId(null);
    setSkillId(null);
    if (!keepChat) {
      setThreadId(null);
      setDrafting(true);
    }
    setPanelIntent("execute");
    setPanelMode("split");
    setMobileSurface("chat");
    pushTarget({
      view: "chat",
      spaceId: "build",
      threadId: keepChat ? threadId : null,
      projectId: null,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: null,
      jobId: id,
      skillId: null,
    });
  }, [pushTarget, threadId, drafting, spaceId, jobId]);

  const openSkill = useCallback((id: string) => {
    const chatActive = Boolean(threadId) || drafting;
    const keepChat = chatActive && spaceId === "build" && skillId === id;

    setView("chat");
    setSpaceId("build");
    setSkillId(id);
    setConnectorId(null);
    setProjectId(null);
    setJobId(null);
    if (!keepChat) {
      setThreadId(null);
      setDrafting(true);
    }
    setPanelIntent("execute");
    setSkillsTool("editor");
    setPanelMode("split");
    setMobileSurface("chat");
    pushTarget({
      view: "chat",
      spaceId: "build",
      threadId: keepChat ? threadId : null,
      projectId: null,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: null,
      jobId: null,
      skillId: id,
    });
  }, [pushTarget, threadId, drafting, spaceId, skillId]);

  const openFile = useCallback((id: string) => {
    setView("space");
    setSpaceId("studio");
    setFileId(id);
    setThreadId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    pushTarget({
      view: "space",
      spaceId: "studio",
      threadId: null,
      projectId: null,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [pushTarget]);

  const value = useMemo(
    () => ({
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
      removeWorkspace,
      workspace,
      view,
      threads,
      threadId,
      thread,
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
      mobileMenuScreen,
      setMobileMenuScreen,
      sidebarOpen,
      setSidebarOpen,
      workspaceRailOpen,
      setWorkspaceRailOpen,
      toggleLeftPanel,
      toggleRightPanel,
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
      setSettingsTab: selectSettingsTab,
      settingsMobileHub,
      setSettingsMobileHub,
      backToSettingsHub,
      settingsWorkspaceId,
      setSettingsWorkspaceId,
      closeSettings,
      spaceLayout,
      setSpaceLayout,
      overlay,
      settingsSpaceId,
      openOverlay,
      openSpaceSettings,
      closeOverlay,
      newChat,
      openCourierHome,
      openSpaceChat,
      setChatSpace,
      armChatInterface,
      selectChatSpace,
      collapseDraft,
      closeSpaceChat,
      clearSessionSummary,
      updateSessionSummary,
      clearPersistentChat,
      sendMessage,
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
      pinTier,
      setPin,
      clearPin,
      togglePin,
      reorderPins,
      moveSidebarNav: moveNavItem,
      openProject,
      openProjectChat,
      backToSpaceHome,
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
      removeWorkspace,
      workspace,
      view,
      threads,
      threadId,
      thread,
      spaceId,
      projectId,
      project,
      pins,
      sidebarLayout,
      panelMode,
      panelIntent,
      panelRatio,
      mobileSurface,
      mobileMenuScreen,
      sidebarOpen,
      workspaceRailOpen,
      toggleLeftPanel,
      toggleRightPanel,
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
      settingsMobileHub,
      backToSettingsHub,
      settingsWorkspaceId,
      closeSettings,
      selectSettingsTab,
      spaceLayout,
      overlay,
      settingsSpaceId,
      openOverlay,
      openSpaceSettings,
      closeOverlay,
      newChat,
      openCourierHome,
      openSpaceChat,
      setChatSpace,
      armChatInterface,
      selectChatSpace,
      collapseDraft,
      closeSpaceChat,
      clearSessionSummary,
      updateSessionSummary,
      clearPersistentChat,
      sendMessage,
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
      pinTier,
      setPin,
      clearPin,
      togglePin,
      reorderPins,
      moveNavItem,
      openProject,
      openProjectChat,
      backToSpaceHome,
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
