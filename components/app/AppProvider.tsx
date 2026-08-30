"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { accountPresets } from "@/lib/data";
import {
  CREATE_PROJECT_SPACE_QUESTIONS,
  formatClarificationAnswersForModel,
  looksLikeBrokenCreateProjectCard,
  normalizeProjectCreateFromClarification,
  sanitizeClarificationQuestions,
  type ClarificationQuestion,
  type ClarificationSubmitResult,
} from "@/lib/ai/clarification/schema";
import {
  clearClarification,
  openClarificationCard,
} from "@/lib/ai/clarification/store";
import {
  migrateThreadTaskState,
  upsertThreadTaskState,
} from "@/lib/ai/task-state";
import { registerAppActionHandlers } from "@/lib/ai/runtime/app-actions";
import { executeAuthorizedTool } from "@/lib/ai/runtime/tools";
import { createApiBundle } from "@/lib/api";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import {
  getChatStoreServerSnapshot,
  getChatStoreSnapshot,
  subscribeChatStore,
  updateChatThreads,
} from "@/lib/api/chat-store";
import {
  findProjectInWorkspace,
} from "@/lib/project-resolver";
import {
  getSpaceEntityStoreServerSnapshot,
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
  subscribeSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { getDataBackend, isSupabaseConfigured } from "@/lib/data-backend";
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
import type { EntityRef } from "@/lib/space-entities";
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
  getWorkspaceServerSnapshot,
  getWorkspaceSnapshot,
  persistActor,
  persistHosting,
  persistWorkspace,
  getPinsServerSnapshot,
  getPinsSnapshot,
  getSidebarServerSnapshot,
  getSidebarSnapshot,
  moveSidebarNav as persistMoveSidebarNav,
  subscribeActor,
  subscribeHosting,
  subscribePins,
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
import { isChatSpace, chatSpaceId, PRIMARY_NAV_SPACES, spaceAllowed, type SidebarLayout, type SidebarNavId } from "@/lib/spaces";
import type {
  AccountPresetId,
  BuildTool,
  CourierView,
  BillingPlan,
  HostingMode,
  Checkpoint,
  ChatImageAttachment,
  ChatFileAttachment,
  ChatSendAttachment,
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
  NavDestinationId,
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
  threadHasTurns,
  upsertPersistentProjectThread,
  upsertPersistentSpaceThread,
} from "@/lib/persistent-chat";
import { MOBILE_PAGER_MS } from "@/lib/mobile-menu-styles";
import {
  requestMobileSurfaceEnter,
} from "@/lib/mobile-nav-transition";
import { useMobileShell } from "@/lib/use-media-query";
import {
  collectTurnVisionImages,
  imageTurnHint,
  modelContentFromMessage,
} from "@/lib/ai/attachment-context";
import { fetchPrivateAiReply } from "@/lib/ai/send-thread-reply";
import { speakText, stopTextToSpeech } from "@/lib/voice/text-to-speech";
import { searchWorkspaceKnowledge } from "@/lib/knowledge/search";
import { typewriterReveal } from "@/lib/ai/typewriter";
import { openProjectImageTab } from "@/lib/chat-image-attach";
import {
  getSupabaseUserServerSnapshot,
  getSupabaseUserSnapshot,
  subscribeSupabaseUser,
} from "@/lib/supabase/auth-store";
import { memberFromSupabaseUser } from "@/lib/supabase/member-from-user";

type Snapshot = {
  view: CourierView;
  spaceId: NavDestinationId | null;
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
  attachments?: ChatImageAttachment[];
  files?: ChatFileAttachment[];
  sendAttachments?: ChatSendAttachment[];
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
  spaceId: NavDestinationId | null;
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
  expandedLayout: boolean;
  expandedPinned: boolean;
  toggleExpandedLayout: () => void;
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
  settingsOrgMemberId: string | null;
  setSettingsOrgMemberId: (id: string | null) => void;
  closeSettings: () => void;
  spaceLayout: SpaceLayout;
  setSpaceLayout: (layout: SpaceLayout) => void;
  overlay: OverlayId;
  settingsSpaceId: SpaceId | null;
  settingsSpaceInitialTab: string | null;
  openOverlay: (id: OverlayId) => void;
  openSpaceSettings: (space: SpaceId, options?: { tab?: string }) => void;
  closeOverlay: () => void;
  newChat: (space?: SpaceId) => void;
  /** Courier home chat — empty chat home. */
  openCourierHome: () => void;
  /** Resume (or create) the persistent dock chat for a space. */
  openSpaceChat: (space: SpaceId, opts?: { keepProject?: boolean }) => void;
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
  /** After a clarification card submit — persist answers and continue the assistant. */
  continueAfterClarification: (result: ClarificationSubmitResult) => void;
  openSpace: (id: NavDestinationId) => void;
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
  entityReference: EntityRef | null;
  setPageReference: (page: PageReference | null) => void;
  clearPageReference: () => void;
  clearEntityReference: () => void;
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
  openProject: (
    id: string,
    opts?: { migrateFromThreadId?: string | null },
  ) => string | null;
  openProjectChat: (id: string) => void;
  /** Navigate to a typed entity ref from any space dashboard. */
  openSpaceEntity: (ref: EntityRef) => void;
  attachReference: (ref: EntityRef) => void;
  promoteToWork: (ref: EntityRef) => void;
  promoteToBuild: (ref: EntityRef) => void;
  /** Pop one level of entity / history navigation (mobile back). */
  popEntityNavigation: () => void;
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
  const supabaseUser = useSyncExternalStore(
    subscribeSupabaseUser,
    getSupabaseUserSnapshot,
    getSupabaseUserServerSnapshot,
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
  const actor = useMemo(() => {
    if (isSupabaseConfigured() && supabaseUser) {
      const matched = orgMembers.find((item) => item.id === supabaseUser.id);
      if (matched) return matched;
      return memberFromSupabaseUser(supabaseUser);
    }
    const matched = orgMembers.find((item) => item.id === actorId);
    if (matched) return matched;
    if (orgMembers[0]) return orgMembers[0];
    return {
      id: actorId || "local-user",
      name: "You",
      email: "",
      short: "You",
      initials: "YO",
      role: "Owner" as const,
      workspaceIds: [] as string[],
      plan: "free" as const,
      seatStatus: "active" as const,
      kind: "personal" as const,
    };
  }, [orgMembers, actorId, supabaseUser]);
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
  const entityRevision = useSyncExternalStore(
    subscribeSpaceEntityStore,
    () => getSpaceEntityStoreSnapshot().revision,
    () => getSpaceEntityStoreServerSnapshot().revision,
  );

  const [view, setView] = useState<CourierView>("chat");
  const chatStore = useSyncExternalStore(
    subscribeChatStore,
    getChatStoreSnapshot,
    getChatStoreServerSnapshot,
  );
  const threads = chatStore.threads;
  const setThreads = useCallback(
    (updater: Thread[] | ((prev: Thread[]) => Thread[])) => {
      updateChatThreads(updater);
    },
    [],
  );
  const [threadId, setThreadId] = useState<string | null>(null);
  const threadIdRef = useRef<string | null>(null);
  threadIdRef.current = threadId;
  const [spaceId, setSpaceId] = useState<NavDestinationId | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("collapsed");
  const [panelIntent, setPanelIntent] = useState<PanelIntent>("browse");
  const [panelRatio, setPanelRatioState] = useState(0.58);
  const [expandedLayout, setExpandedLayout] = useState(false);
  const [expandedPinned, setExpandedPinned] = useState(false);
  const layoutSnapshot = useRef<{
    sidebarOpen: boolean;
    workspaceRailOpen: boolean;
    panelRatio: number;
    panelMode: PanelMode;
  } | null>(null);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("chat");
  const [mobileMenuScreen, setMobileMenuScreen] =
    useState<MobileMenuScreen>("main");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceRailOpen, setWorkspaceRailOpen] = useState(false);
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
  const [settingsOrgMemberId, setSettingsOrgMemberId] = useState<string | null>(
    null,
  );
  const [spaceLayout, setSpaceLayout] = useState<SpaceLayout>("list");
  const [overlay, setOverlay] = useState<OverlayId>(null);
  const [settingsSpaceId, setSettingsSpaceId] = useState<SpaceId | null>(null);
  const [settingsSpaceInitialTab, setSettingsSpaceInitialTab] = useState<
    string | null
  >(null);
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
  const [entityReference, setEntityReference] = useState<EntityRef | null>(null);
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

  const mobile = useMobileShell();
  const mobileNavTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (mobileNavTimer.current) clearTimeout(mobileNavTimer.current);
    };
  }, []);

  useEffect(() => {
    if (workspacesFor(actor, entitlements).length < 2) {
      setWorkspaceRailOpen(false);
    }
  }, [actor, entitlements]);

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
  const project = useMemo(() => {
    if (!projectId) return undefined;
    return findProjectInWorkspace(workspaceId, projectId);
  }, [projectId, workspaceId, entityRevision]);
  const thread =
    threads.find((item) => item.id === threadId) ??
    (threadIdRef.current && threadIdRef.current !== threadId
      ? threads.find((item) => item.id === threadIdRef.current) ?? null
      : null);
  const setHostingMode = useCallback((id: HostingMode) => {
    persistHosting(id);
  }, []);

  const setActor = useCallback((id: string) => {
    persistActor(id);
  }, []);

  const setPreview = useCallback((id: AccountPresetId) => {
    if (isSupabaseConfigured()) return;
    const preset = accountPresets.find((item) => item.id === id);
    if (!preset) return;
    persistActor(preset.actorId);
    setOverlay((current) => (current === "invite-wall" ? null : current));
  }, []);

  const setBillingPlan = useCallback((plan: BillingPlan) => {
    if (isSupabaseConfigured()) return;
    const preset: AccountPresetId =
      plan === "free" ? "free" : plan === "pro" ? "pro" : "max-owner";
    const match = accountPresets.find((item) => item.id === preset);
    if (match) persistActor(match.actorId);
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
      const opts = { billingPlan };

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
        if (prevSpace === "research") setResearchTool("browser");

        if (chatWasOpen && isChatSpace(prevSpace)) {
          let tid = "";
          let hasMessages = false;
          setThreads((current) => {
            const { threads: next, id: nextId } = upsertPersistentSpaceThread(
              current,
              id,
              prevSpace,
            );
            tid = nextId;
            hasMessages = threadHasTurns(
              next.find((item) => item.id === nextId),
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
    // Keep a usable right-panel share when opening from empty New Chat.
    setPanelRatioState((ratio) => (ratio < 0.5 ? 0.55 : ratio));
    setMobileSurface("chat");
  }, [panelMode]);

  const setPanelRatio = useCallback((n: number) => {
    setPanelRatioState(n);
    setExpandedPinned(false);
  }, []);

  const toggleExpandedLayout = useCallback(() => {
    if (expandedLayout) {
      const snap = layoutSnapshot.current;
      layoutSnapshot.current = null;
      setExpandedLayout(false);
      setExpandedPinned(false);
      if (snap) {
        setSidebarOpen(snap.sidebarOpen);
        setWorkspaceRailOpen(snap.workspaceRailOpen);
        setPanelRatioState(snap.panelRatio);
        setPanelMode(snap.panelMode);
      }
      return;
    }
    layoutSnapshot.current = {
      sidebarOpen,
      workspaceRailOpen,
      panelRatio,
      panelMode,
    };
    setSidebarOpen(false);
    setWorkspaceRailOpen(false);
    setExpandedLayout(true);
    setExpandedPinned(true);
    setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
  }, [
    expandedLayout,
    sidebarOpen,
    workspaceRailOpen,
    panelRatio,
    panelMode,
  ]);

  const openSpaceChat = useCallback(
    (space: SpaceId, opts?: { keepProject?: boolean }) => {
      if (!isChatSpace(space)) return;
      const keepProject = Boolean(opts?.keepProject && projectId);
      let tid = "";
      let hasMessages = false;
      setThreads((current) => {
        const result =
          keepProject && projectId
            ? upsertPersistentProjectThread(
                current,
                workspaceId,
                projectId,
                space,
              )
            : upsertPersistentSpaceThread(current, workspaceId, space);
        tid = result.id;
        hasMessages = threadHasTurns(
          result.threads.find((item) => item.id === result.id),
        );
        return result.threads;
      });
      setThreadId(tid);
      setSpaceId(space);
      if (!keepProject) setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setView("space");
      setPanelIntent("execute");
      setPanelMode("split");
      setMobileSurface("chat");
      setDrafting(!hasMessages);
      if (space === "build") setBuildTool("preview");
      if (space === "research") setResearchTool("browser");
      pushTarget({
        view: "space",
        spaceId: space,
        threadId: tid,
        projectId: keepProject ? projectId : null,
        panelMode: "split",
        panelIntent: "execute",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [workspaceId, pushTarget, projectId],
  );

  const applyHomeNewChat = useCallback(() => {
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
    setMobileSurface("chat");
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
  }, [pushTarget]);

  const newChat = useCallback(
    (space?: SpaceId) => {
      if (space && isChatSpace(space) && projectId && spaceId === space) {
        let tid = "";
        let hasMessages = false;
        setThreads((current) => {
          const { threads: next, id } = upsertPersistentProjectThread(
            current,
            workspaceId,
            projectId,
            space,
          );
          tid = id;
          hasMessages = threadHasTurns(next.find((item) => item.id === id));
          return next;
        });
        setThreadId(tid);
        setDrafting(!hasMessages);
        setView("space");
        setPanelIntent("execute");
        setPanelMode("split");
        setMobileSurface("chat");
        if (space === "build") setBuildTool("preview");
        if (space === "research") setResearchTool("browser");
        pushTarget({
          view: "space",
          spaceId: space,
          threadId: tid,
          projectId,
          panelMode: "split",
          panelIntent: "execute",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }

      if (space && isChatSpace(space)) {
        let tid = "";
        let hasMessages = false;
        setThreads((current) => {
          const { threads: next, id } = upsertPersistentSpaceThread(
            current,
            workspaceId,
            space,
          );
          tid = id;
          hasMessages = threadHasTurns(next.find((item) => item.id === id));
          return next;
        });
        setThreadId(tid);
        setSpaceId(space);
        setProjectId(null);
        setConnectorId(null);
        setJobId(null);
        setSkillId(null);
        setView("space");
        setDrafting(!hasMessages);
        setPanelIntent("execute");
        setPanelMode("split");
        setMobileSurface("chat");
        if (space === "build") setBuildTool("preview");
        if (space === "research") setResearchTool("browser");
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

      if (mobileNavTimer.current) {
        clearTimeout(mobileNavTimer.current);
        mobileNavTimer.current = null;
      }

      const slideFirst =
        mobile &&
        (mobileSurface === "panel" || mobileSurface === "menu");

      if (slideFirst) {
        setMobileSurface("chat");
        if (mobileSurface === "menu") {
          setMobileMenuScreen("main");
        }
        mobileNavTimer.current = window.setTimeout(() => {
          mobileNavTimer.current = null;
          applyHomeNewChat();
        }, MOBILE_PAGER_MS);
        return;
      }

      applyHomeNewChat();
    },
    [
      mobile,
      mobileSurface,
      applyHomeNewChat,
      pushTarget,
      workspaceId,
      projectId,
      spaceId,
    ],
  );

  const openCourierHome = useCallback(() => {
    newChat();
  }, [newChat]);

  const setChatSpace = useCallback((id: SpaceId | null) => {
    setSpaceId(id);
    setView("chat");
    if (id === "research") setResearchTool("browser");
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
        hasMessages = threadHasTurns(next.find((item) => item.id === nextId));
        return next;
      });
      setThreadId(tid);
      setDrafting(!hasMessages);
      setView("space");
      setSpaceId(id);
      setProjectId(null);
      setPanelIntent("execute");
      // Keep a user-collapsed right panel collapsed while arming chat.
      setMobileSurface((surface) => (surface === "menu" ? "chat" : surface));
      if (id === "build") setBuildTool("preview");
      if (id === "research") setResearchTool("browser");
    },
    [workspaceId],
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
      if (id === "research")
        setResearchTool(opts?.researchTool ?? "browser");
      if (threadId && !projectId) {
        let tid = threadId;
        setThreads((current) => {
          const existing = current.find((item) => item.id === threadId);
          if (
            existing?.persistent &&
            !existing.projectId &&
            existing.workspaceId === workspaceId
          ) {
            const upserted = upsertPersistentSpaceThread(
              current,
              workspaceId,
              id,
            );
            tid = upserted.id;
            return upserted.threads;
          }
          return current.map((item) =>
            item.id === threadId ? { ...item, spaceId: id } : item,
          );
        });
        setThreadId(tid);
      }
    },
    [threadId, workspaceId, projectId],
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
    const keepProject = Boolean(projectId);
    if (keepProject) {
      setMobileSurface("panel");
    } else {
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setPanelMode("collapsed");
      setPanelIntent("browse");
      setMobileSurface("chat");
    }
    if (view === "space" && spaceId) {
      pushTarget({
        view: "space",
        spaceId,
        threadId: null,
        projectId: keepProject ? projectId : null,
        panelMode: keepProject ? panelMode : "collapsed",
        panelIntent: keepProject ? panelIntent : "browse",
        connectorId: keepProject ? connectorId : null,
        jobId: keepProject ? jobId : null,
        skillId: keepProject ? skillId : null,
      });
    }
  }, [
    view,
    spaceId,
    pushTarget,
    threadId,
    summarizeThreadById,
    projectId,
    panelMode,
    panelIntent,
    connectorId,
    jobId,
    skillId,
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
      const sendAttachments = opts?.sendAttachments ?? [];
      const attachmentsFromSend = sendAttachments
        .filter((a) => a.type === "image" && a.dataUrl)
        .map((a) => ({
          url: a.dataUrl!,
          name: a.filename,
          mime: a.mimeType,
        }));
      const filesFromSend = sendAttachments
        .filter((a) => a.type === "file")
        .map((a) => ({
          name: a.filename,
          ...(a.text ? { text: a.text } : {}),
        }));
      const attachments =
        attachmentsFromSend.length > 0
          ? attachmentsFromSend
          : (opts?.attachments?.filter((a) => a.url?.startsWith("data:image/")) ??
            []);
      const fileAttachments =
        filesFromSend.length > 0 ? filesFromSend : (opts?.files ?? []);
      const trimmed = text.trim();
      if (!trimmed && !attachments.length && !fileAttachments.length) return;
      const contentForIntent =
        trimmed ||
        (attachments.length
          ? "(image attached)"
          : fileAttachments.length
            ? "(file attached)"
            : "");
      const kind = classifyTurn(contentForIntent);
      const intent = inferIntent(
        contentForIntent,
        workspaceId,
        opts?.space ?? spaceId,
      );
      const currentChat =
        opts?.space ?? (isChatSpace(spaceId) ? spaceId : null);
      const allowed = memberSpaces(workspaceId, actor.id, workspacePolicies);
      const planOpts = { billingPlan };
      const entityContext =
        Boolean(connectorId) ||
        Boolean(projectId) ||
        Boolean(jobId) ||
        Boolean(skillId);
      // Home New Chat: never auto-enter a Space from keyword intent.
      const hasExplicitSpace = Boolean(currentChat) || Boolean(opts?.space);
      const onUnscopedChat =
        !hasExplicitSpace && !entityContext && view === "chat";
      const inferredChat =
        hasExplicitSpace &&
        intent.resolved &&
        isChatSpace(intent.space) &&
        spaceAllowed(intent.space, allowed, planOpts)
          ? intent.space
          : null;
      const stayInChat =
        onUnscopedChat ||
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

      const space = onUnscopedChat
        ? null
        : (inferredChat ??
          currentChat ??
          (connectorId
            ? "connectors"
            : jobId || skillId
              ? "build"
              : project
                ? project.space
                : null) ??
          (intent.resolved ? intent.space : null));
      const matched =
        onUnscopedChat || !intent.projectId
          ? undefined
          : findProjectInWorkspace(workspaceId, intent.projectId);
      if (matched && matched.workspaceId !== workspaceId) {
        persistWorkspace(matched.workspaceId);
      }

      const selection = selectedId;
      const imageBlocks = attachments.map((item) => ({
        type: "image" as const,
        url: item.url,
        name: item.name,
        mime: item.mime,
      }));
      const fileBlocks = fileAttachments.map((item) => ({
        type: "file" as const,
        name: item.name,
        ...(item.text ? { text: item.text } : {}),
      }));
      const displayBlocks = [...imageBlocks, ...fileBlocks];
      // Bubble shows typed text only — never "[User attached file…]" markers.
      const displayText = trimmed;
      const userMsg: Message = {
        id: nextId("u"),
        role: "user",
        content: displayText,
        at: nowTime(),
        blocks: displayBlocks.length ? displayBlocks : undefined,
      };

      let assistantMsg: Message = {
        id: nextId("a"),
        role: "assistant",
        content: intent.reply,
        at: nowTime(),
      };

      // Signed-in: live AI for chat + construction/skill/research turns.
      // Keep local mock UI only for special chrome kinds (undo, connect, …)
      // or when offline / unsigned.
      const canLiveAi =
        isSupabaseConfigured() && Boolean(supabaseUser);
      const useLiveAi =
        canLiveAi &&
        (kind === "chat" ||
          kind === "build" ||
          kind === "refine" ||
          kind === "skill" ||
          kind === "research");

      if (useLiveAi) {
        // Always show the primary Thinking line; detail only arrives for tools/work.
        assistantMsg = {
          ...assistantMsg,
          content: "",
          status: "pending",
          activity: {
            label: "Thinking",
            kind: "idle",
          },
        };
      }

      const turnVision = collectTurnVisionImages(attachments.map((a) => a.url));
      const imageUrls = turnVision.ok ? turnVision.urls : [];
      // Only mention images to the model when real bytes will be sent.
      const aiUserContent = [
        trimmed,
        ...fileAttachments.map((f) =>
          f.text?.trim()
            ? `File “${f.name}” contents:\n${f.text.trim()}`
            : `File attached: ${f.name}`,
        ),
        ...(imageUrls.length ? [imageTurnHint(imageUrls.length)] : []),
      ]
        .filter(Boolean)
        .join("\n\n");

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
      } else if (!useLiveAi && kind === "skill") {
        const skill = skillReply(trimmed);
        assistantMsg = { ...assistantMsg, content: skill.content, blocks: skill.blocks };
      } else if (!useLiveAi && kind === "research") {
        const research = researchReply();
        assistantMsg = {
          ...assistantMsg,
          content: research.content,
          blocks: research.blocks,
        };
      } else if (!useLiveAi && (kind === "build" || kind === "refine")) {
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
      const chatSpace = chatSpaceId(space);
      const useProjectPersistent =
        Boolean(projectId) && Boolean(chatSpace) && isChatSpace(space);
      const useSpacePersistent =
        Boolean(chatSpace) &&
        isChatSpace(space) &&
        !projectId &&
        !intent.projectId &&
        (view === "space" || Boolean(opts?.space));
      const usePersistent = useProjectPersistent || useSpacePersistent;
      let activeId = threadId ?? nextId("t");

      setThreads((current) => {
        let list = current;
        if (useProjectPersistent && projectId && chatSpace) {
          const upserted = upsertPersistentProjectThread(
            list,
            workspaceId,
            projectId,
            chatSpace,
          );
          list = upserted.threads;
          activeId = upserted.id;
        } else if (useSpacePersistent && chatSpace) {
          const upserted = upsertPersistentSpaceThread(
            list,
            workspaceId,
            chatSpace,
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
                  title: item.messages.length ? item.title : displayText.slice(0, 48),
                  snippet: displayText,
                  updatedAt: new Date().toISOString(),
                  spaceId: chatSpace ?? undefined,
                  projectId: useProjectPersistent
                    ? projectId ?? item.projectId
                    : (intent.projectId ?? item.projectId),
                  workspaceId: matched?.workspaceId ?? item.workspaceId,
                  persistent: usePersistent ? true : item.persistent,
                  sessionSummary: null,
                  createdBy: item.createdBy ?? actor.id,
                  messages: [...item.messages, userMsg, assistantMsg],
                }
              : item,
          );
        }
        const created: Thread = {
          id: activeId,
          title: displayText.slice(0, 52),
          workspaceId: matched?.workspaceId ?? workspaceId,
          projectId: useProjectPersistent ? projectId ?? undefined : intent.projectId,
          spaceId: chatSpace ?? undefined,
          updatedAt: new Date().toISOString(),
          snippet: displayText,
          messages: [userMsg, assistantMsg],
          persistent: usePersistent || undefined,
          sessionSummary: null,
          createdBy: actor.id,
        };
        return [created, ...list];
      });
      setThreadId(activeId);
      setDrafting(false);

      if (attachments.length && projectId && isChatSpace(space)) {
        for (const image of attachments) {
          openProjectImageTab({
            profileId: actor.id,
            workspaceId: matched?.workspaceId ?? workspaceId,
            spaceId: space,
            projectId,
            projectTitle: project?.name ?? "Project",
            imageUrl: image.url,
            imageName: image.name,
          });
        }
      }

      if (
        !useLiveAi &&
        (kind === "build" || kind === "refine" || kind === "fix")
      ) {
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

      const kickLiveAi = () => {
        if (!useLiveAi) return;
        const liveThreads = getChatStoreSnapshot().threads;
        const liveThread =
          liveThreads.find((item) => item.id === activeId) ?? thread ?? null;
        const priorAiChatId =
          liveThread?.aiChatId ??
          threads.find((item) => item.id === activeId)?.aiChatId ??
          null;
        const historyMessages = (liveThread?.messages ?? [])
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              m.id !== assistantId &&
              m.status !== "pending" &&
              m.status !== "streaming" &&
              !m.event &&
              (Boolean(m.content?.trim()) ||
                Boolean(m.blocks?.some((b) => b.type === "image" || b.type === "file"))) &&
              m.content !== "Thinking…" &&
              m.content !== "Thinking...",
          )
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: modelContentFromMessage(m) || m.content,
          }))
          .filter((m) => Boolean(m.content?.trim()));
        const replyProjectId =
          projectId ?? intent.projectId ?? matched?.id ?? null;
        const replyProjectSpace =
          matched?.space ??
          project?.space ??
          (isChatSpace(space) ? space : null) ??
          null;
        const turnVision = collectTurnVisionImages(attachments.map((a) => a.url));
        const imageUrls = turnVision.ok ? turnVision.urls : [];
        // Prefer current-turn bytes; never call the model with name-only image claims.
        if (attachments.length > 0 && imageUrls.length === 0) {
          setThreads((current) =>
            current.map((item) => ({
              ...item,
              messages: item.messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      status: "complete" as const,
                      activity: null,
                      content:
                        turnVision.ok
                          ? "I couldn’t read that photo’s bytes. Try again, or send a JPEG/PNG screenshot."
                          : turnVision.error,
                    }
                  : message,
              ),
            })),
          );
          return;
        }
        if (imageUrls.length) {
          console.log("[IMAGE_UPLOADED]", {
            count: imageUrls.length,
            mimeType: attachments[0]?.mime ?? "image/jpeg",
            size: imageUrls.reduce((n, u) => n + u.length, 0),
          });
        }
        void fetchPrivateAiReply({
          aiChatId: priorAiChatId,
          threadId: activeId,
          title: displayText.slice(0, 52) || attachments[0]?.name || "Chat",
          content: aiUserContent,
          workspaceId: matched?.workspaceId ?? workspaceId,
          projectId: replyProjectId,
          projectSpace: replyProjectSpace,
          messages: historyMessages,
          ...(imageUrls.length ? { images: imageUrls } : {}),
          onProgress: (progress) => {
            const detailRaw = progress.detail?.trim() || "";
            const isLegacyAbout = /^Thinking about\b/i.test(detailRaw);
            const showDetail =
              !isLegacyAbout &&
              Boolean(detailRaw) &&
              (progress.phase === "tool" ||
                progress.phase === "follow_up" ||
                progress.phase === "generating" ||
                (progress.phase === "thinking" &&
                  detailRaw !== "" &&
                  !isLegacyAbout));
            const nextActivity = {
              label: "Thinking",
              kind: (progress.phase === "tool"
                ? "tool"
                : showDetail
                  ? "work"
                  : "idle") as "idle" | "tool" | "work",
              ...(showDetail ? { detail: detailRaw } : {}),
            };
            setThreads((current) =>
              current.map((item) => ({
                ...item,
                messages: item.messages.map((message) => {
                  const isTarget =
                    message.id === assistantId ||
                    (message.role === "assistant" &&
                      (message.status === "pending" ||
                        message.status === "streaming") &&
                      !message.content);
                  return isTarget
                    ? {
                        ...message,
                        activity: nextActivity,
                      }
                    : message;
                }),
              })),
            );
          },
        })
          .then((result) => {
            const isPendingAssistant = (message: Message) =>
              message.id === assistantId ||
              (message.role === "assistant" &&
                (message.status === "pending" ||
                  message.status === "streaming" ||
                  message.content === "Thinking…" ||
                  message.content === "Thinking..."));

            const patchAssistant = (
              content: string,
              status: "streaming" | "complete",
              condensationOccurred: boolean,
            ) => {
              setThreads((current) => {
                const apply = (item: Thread): Thread => {
                  let nextMessages = item.messages.map((message) =>
                    isPendingAssistant(message) || message.id === assistantId
                      ? {
                          ...message,
                          content,
                          status,
                          activity: status === "complete" ? null : message.activity,
                          ...(status === "complete"
                            ? {
                                blocks: (message.blocks ?? []).filter(
                                  (b) => b.type !== "tool",
                                ),
                              }
                            : {}),
                        }
                      : message,
                  );
                  if (
                    condensationOccurred &&
                    status === "complete" &&
                    !nextMessages.some((m) => m.event === "condensed")
                  ) {
                    nextMessages = [
                      ...nextMessages,
                      {
                        id: nextId("evt"),
                        role: "system",
                        content: "__CHAT_CONDENSED__",
                        at: nowTime(),
                        event: "condensed" as const,
                      },
                    ];
                  }
                  return {
                    ...item,
                    aiChatId: result.aiChatId.startsWith("local-")
                      ? item.aiChatId
                      : result.aiChatId,
                    messages: nextMessages,
                  };
                };
                if (current.some((item) => item.id === activeId)) {
                  return current.map((item) =>
                    item.id === activeId ? apply(item) : item,
                  );
                }
                return current.map((item) =>
                  item.messages.some(
                    (m) => m.id === assistantId || isPendingAssistant(m),
                  )
                    ? apply(item)
                    : item,
                );
              });
            };

            // Apple on-device is already slow — skip fake typewriter lag.
            if (result.runtime === "apple-local") {
              patchAssistant(
                result.content,
                "complete",
                result.condensationOccurred,
              );
              if (voiceActive) {
                speakText(sanitizeAssistantVisibleText(result.content));
              }
              return;
            }

            typewriterReveal(result.content, (partial, done) => {
              patchAssistant(
                partial,
                done ? "complete" : "streaming",
                done && result.condensationOccurred,
              );
              if (done && voiceActive) {
                speakText(sanitizeAssistantVisibleText(result.content));
              }
            });
          })
          .catch(() => {
            setThreads((current) =>
              current.map((item) => ({
                ...item,
                messages: item.messages.map((message) => {
                  const isTarget =
                    message.id === assistantId ||
                    (message.role === "assistant" &&
                      (message.status === "pending" ||
                        message.content === "Thinking…" ||
                        message.content === "Thinking..."));
                  return isTarget
                    ? {
                        ...message,
                        status: "error" as const,
                        content:
                          "I couldn't reach the AI bridge. Check that Ollama, the local bridge, and the HTTPS tunnel are running.",
                      }
                    : message;
                }),
              })),
            );
          });
      };

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
        kickLiveAi();
        return;
      }
      const keepSpace =
        Boolean(space) &&
        (view === "space" || Boolean(opts?.space)) &&
        (PRIMARY_NAV_SPACES as readonly string[]).includes(space as string) &&
        (!entityContext || Boolean(projectId));
      setView(keepSpace ? "space" : "chat");
      setSpaceId(space ?? spaceId);
      setProjectId(
        onUnscopedChat
          ? projectId
          : (projectId ?? intent.projectId ?? null),
      );
      setSkillId(
        skillId ?? opts?.skillId ?? null,
      );
      setPanelIntent("execute");
      setConnectorId(
        onUnscopedChat ? connectorId : (intent.connectorId ?? connectorId),
      );
      setJobId(onUnscopedChat ? jobId : (intent.jobId ?? jobId));
      if (!onUnscopedChat && space && intent.buildTool) setBuildTool(intent.buildTool);
      if (!onUnscopedChat && space === "build") setBuildTool("preview");
      if (!onUnscopedChat && space === "research") setResearchTool("browser");
      if (!onUnscopedChat && space && (kind === "build" || kind === "refine" || kind === "fix"))
        setBuildTool("preview");
      if (!onUnscopedChat && space && kind === "changes") setBuildTool("activity");
      // First turn from an empty chat opens the right panel; later turns
      // respect a user-collapsed panel (full-window chat stays full-window).
      const nextPanelMode =
        panelMode === "collapsed" && !threadHasTurns(thread)
          ? "split"
          : panelMode;
      setPanelMode(nextPanelMode);
      setMobileSurface("chat");
      pushTarget({
        view: keepSpace ? "space" : "chat",
        spaceId: space ?? spaceId,
        threadId: activeId,
        projectId: onUnscopedChat
          ? projectId
          : (projectId ?? intent.projectId ?? null),
        panelMode: nextPanelMode,
        panelIntent: "execute",
        connectorId: onUnscopedChat
          ? connectorId
          : (intent.connectorId ?? connectorId),
        jobId: onUnscopedChat ? jobId : (intent.jobId ?? jobId),
        skillId: skillId ?? opts?.skillId ?? null,
      });
      kickLiveAi();
    },
    [
      threadId,
      thread,
      threads,
      workspaceId,
      spaceId,
      projectId,
      project,
      connectorId,
      jobId,
      skillId,
      view,
      drafting,
      panelMode,
      pushTarget,
      selectedId,
      checkpoints,
      memory,
      liveUrl,
      project?.name,
      billingPlan,
      workspacePolicies,
      supabaseUser,
      actor.id,
      voiceActive,
      setThreads,
    ],
  );

  const continueAfterClarification = useCallback(
    (result: ClarificationSubmitResult) => {
      const activeId = threadId;
      if (!activeId) return;
      clearClarification(activeId);
      const assistantId = nextId("a");
      const userMsgId = nextId("u");
      const summary = formatClarificationAnswersForModel(result);

      setThreads((current) =>
        current.map((item) => {
          if (item.id !== activeId) return item;
          return {
            ...item,
            updatedAt: nowTime(),
            snippet: result.title,
            messages: [
              ...item.messages,
              {
                id: userMsgId,
                role: "user" as const,
                content: `Submitted: ${result.title}`,
                at: nowTime(),
                blocks: [
                  {
                    type: "clarification" as const,
                    title: result.title,
                    answers: result.answers,
                    skipped: result.skipped,
                  },
                ],
              },
              {
                id: assistantId,
                role: "assistant" as const,
                content: "",
                at: nowTime(),
                status: "pending" as const,
              },
            ],
          };
        }),
      );

      const live = getChatStoreSnapshot().threads.find((t) => t.id === activeId);
      const historyMessages = (live?.messages ?? [])
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            m.id !== assistantId &&
            m.status !== "pending" &&
            (Boolean(m.content?.trim()) ||
              Boolean(
                m.blocks?.some((b) => b.type === "image" || b.type === "file"),
              )),
        )
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: modelContentFromMessage(m) || m.content,
        }))
        .filter((m) => Boolean(m.content?.trim()));

      const resumeContent = result.resumeTool
        ? `${summary}\n\nPlease continue using tool ${result.resumeTool} with these answers merged into arguments.`
        : `${summary}\n\nContinue with the task using these answers.`;

      void (async () => {
        if (result.resumeTool) {
          const merged: Record<string, unknown> = {
            ...(result.resumeArguments ?? {}),
            ...result.answers,
          };
          if (result.resumeTool === "project.create") {
            const normalized = normalizeProjectCreateFromClarification(
              result.answers,
              result.resumeArguments,
            );
            merged.title = normalized.title;
            if (normalized.space) merged.space = normalized.space;
            else delete merged.space;
          }
          if (
            result.resumeTool === "project.open" &&
            !merged.projectId &&
            result.answers.projectId
          ) {
            merged.projectId = result.answers.projectId;
          }
          const toolResult = await executeAuthorizedTool({
            name: result.resumeTool,
            arguments: merged,
          });
          if (toolResult.ok && !toolResult.pauseForUser) {
            upsertThreadTaskState(threadIdRef.current || activeId, {
              step: "resumed",
              facts: { ...result.answers },
              pendingClarification: null,
              status: "completed",
              lastToolResults: [
                {
                  name: result.resumeTool,
                  ok: true,
                  detail: toolResult.output,
                },
              ],
            });
            // Message may have migrated to a project thread during resume.
            setThreads((current) =>
              current.map((item) => ({
                ...item,
                messages: item.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: sanitizeAssistantVisibleText(
                          toolResult.output,
                        ),
                        status: "complete" as const,
                        blocks: (m.blocks ?? []).filter(
                          (b) => b.type !== "tool",
                        ),
                      }
                    : m,
                ),
              })),
            );
            return;
          }
          if (!toolResult.ok) {
            upsertThreadTaskState(threadIdRef.current || activeId, {
              status: "failed",
              pendingClarification: null,
            });
            setThreads((current) =>
              current.map((item) => ({
                ...item,
                messages: item.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content:
                          "I couldn't finish that step. Try again, or tell me what to change.",
                        status: "complete" as const,
                        blocks: (m.blocks ?? []).filter(
                          (b) => b.type !== "tool",
                        ),
                      }
                    : m,
                ),
              })),
            );
            return;
          }
        }

        const reply = await fetchPrivateAiReply({
          aiChatId: live?.aiChatId ?? null,
          threadId: activeId,
          title: result.title.slice(0, 52),
          content: resumeContent,
          workspaceId,
          projectId,
          projectSpace: (spaceId as SpaceId | null) ?? null,
          messages: historyMessages,
          onProgress: (progress) => {
            const detailRaw = progress.detail?.trim() || "";
            const isLegacyAbout = /^Thinking about\b/i.test(detailRaw);
            const showDetail =
              !isLegacyAbout &&
              Boolean(detailRaw) &&
              (progress.phase === "tool" || progress.phase === "follow_up");
            const nextActivity = {
              label: "Thinking",
              kind: (progress.phase === "tool"
                ? "tool"
                : showDetail
                  ? "work"
                  : "idle") as "idle" | "tool" | "work",
              ...(showDetail ? { detail: detailRaw } : {}),
            };
            setThreads((current) =>
              current.map((item) => ({
                ...item,
                messages: item.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        activity: nextActivity,
                      }
                    : m,
                ),
              })),
            );
          },
        });
        const applyReply = (partial: string, done: boolean) => {
          setThreads((current) =>
            current.map((item) => {
              if (item.id !== activeId) return item;
              return {
                ...item,
                aiChatId: reply.aiChatId.startsWith("local-")
                  ? item.aiChatId
                  : reply.aiChatId || item.aiChatId,
                messages: item.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: partial,
                        status: done
                          ? ("complete" as const)
                          : ("streaming" as const),
                        activity: done ? null : m.activity,
                      }
                    : m,
                ),
              };
            }),
          );
        };
        if (reply.runtime === "apple-local") {
          applyReply(reply.content, true);
          return;
        }
        typewriterReveal(reply.content, applyReply);
      })();
    },
    [threadId, workspaceId, projectId, spaceId, setThreads],
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

  const openSpace = useCallback((id: NavDestinationId) => {
    const allowed = memberSpaces(workspaceId, actor.id, workspacePolicies);
    const planOpts = { billingPlan };
    let target: NavDestinationId | null = id;
    if (target && !spaceAllowed(target, allowed, planOpts)) {
      target = null;
    }
    if (!target) {
      const fallback = (["build", "research", "work"] as const).find((space) =>
        spaceAllowed(space, allowed, planOpts),
      );
      if (!fallback) {
        newChat();
        return;
      }
      target = fallback;
    }

    const dest = target;
    const chatActive = Boolean(threadId) || drafting;

    if (dest === spaceId && projectId && isChatSpace(dest)) {
      let tid = threadId;
      let hasMessages = Boolean(thread);
      setThreads((current) => {
        const { threads: next, id: nextId } = upsertPersistentSpaceThread(
          current,
          workspaceId,
          dest,
        );
        tid = nextId;
        hasMessages = threadHasTurns(next.find((item) => item.id === nextId));
        return next;
      });
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setThreadId(tid);
      setDrafting(!hasMessages);
      setPanelIntent(chatActive ? "execute" : "browse");
      setPanelMode(chatActive ? "split" : "collapsed");
      setView("space");
      setMobileSurface("panel");
      pushTarget({
        view: "space",
        spaceId: dest,
        threadId: tid,
        projectId: null,
        panelMode: chatActive ? "split" : "collapsed",
        panelIntent: chatActive ? "execute" : "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
      return;
    }

    if (chatActive && target === spaceId) {
      setMobileSurface("chat");
      if (panelMode === "collapsed") {
        setPanelMode("split");
        setPanelIntent("execute");
      }
      return;
    }

    const goToSpace = (dest: NavDestinationId) => {
      setView("space");
      setSpaceId(dest);
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      if (chatActive && isChatSpace(dest)) {
        let tid = "";
        let hasMessages = false;
        setThreads((current) => {
          const { threads: next, id: nextId } = upsertPersistentSpaceThread(
            current,
            workspaceId,
            dest,
          );
          tid = nextId;
          hasMessages = threadHasTurns(next.find((item) => item.id === nextId));
          return next;
        });
        setThreadId(tid);
        setDrafting(!hasMessages);
        setPanelIntent("execute");
        setPanelMode("split");
        setMobileSurface("panel");
        pushTarget({
          view: "space",
          spaceId: dest,
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
      setPanelIntent("browse");
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
    newChat,
    actor.id,
    threadId,
    drafting,
    spaceId,
    panelMode,
    projectId,
    thread,
  ]);

  const openRecents = useCallback(() => {
    setView("recents");
    setSpaceId(null);
    setProjectId(null);
    setThreadId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    setMobileSurface("chat");
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
    queueMicrotask(() => setVoiceActive(false));
  }, [entitlements.hasVoice]);

  useEffect(() => {
    if (panelMode !== "collapsed") return;
    if (!drafting || threadId) return;
    queueMicrotask(() => {
      setDrafting(false);
      setPanelIntent("browse");
    });
  }, [panelMode, drafting, threadId]);


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
    if (spaceId !== "work") return;
    const allowed = memberSpaces(workspaceId, actor.id, workspacePolicies);
    const opts = { billingPlan };
    if (spaceAllowed("work", allowed, opts)) return;
    queueMicrotask(() => openSpace("work"));
  }, [spaceId, workspaceId, workspacePolicies, billingPlan, openSpace, actor.id]);

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
        { billingPlan },
      );
    },
    [workspaceId, workspacePolicies, billingPlan],
  );

  const openProject = useCallback((
    id: string,
    opts?: { migrateFromThreadId?: string | null },
  ): string | null => {
    const ctx = { workspaceId, actorId: actor.id };
    let match:
      | ReturnType<typeof localSpaceEntityStore.getProject>
      | ReturnType<typeof findProjectInWorkspace>
      | undefined;
    try {
      match = localSpaceEntityStore.getProject(ctx, id) ?? undefined;
    } catch {
      match = undefined;
    }
    if (!match) {
      try {
        match = findProjectInWorkspace(workspaceId, id);
      } catch {
        match = undefined;
      }
    }
    if (!match) {
      match = getSpaceEntityStoreSnapshot().projects.find((item) => item.id === id);
    }
    if (!match) return null;
    const space = match.space;
    const itemWorkspaceId = match.workspaceId;
    const projectKey = match.id;
    if (itemWorkspaceId !== workspaceId) persistWorkspace(itemWorkspaceId);
    const migrateFrom = opts?.migrateFromThreadId?.trim() || null;
    let tid = "";
    let hasMessages = false;
    // Switch selection before mutating the store so useSyncExternalStore
    // never paints an emptied source thread under the old threadId.
    const snapshot = getChatStoreSnapshot().threads;
    const source = migrateFrom
      ? snapshot.find((item) => item.id === migrateFrom)
      : null;
    const { threads: next, id: nextId } = upsertPersistentProjectThread(
      snapshot,
      itemWorkspaceId,
      projectKey,
      space,
    );
    tid = nextId;
    const projectThread = next.find((item) => item.id === nextId);
    const projectEmpty = !threadHasTurns(projectThread);
    let migrated = next;
    if (source && projectEmpty && source.id !== nextId) {
      migrated = next.map((item) => {
        if (item.id === nextId) {
          return {
            ...item,
            title: item.title || source.title,
            snippet: source.snippet,
            messages: source.messages.map((m) => ({ ...m })),
            aiChatId: source.aiChatId ?? item.aiChatId,
            sessionSummary: source.sessionSummary ?? item.sessionSummary,
            updatedAt: nowTime(),
          };
        }
        if (item.id === source.id) {
          return {
            ...item,
            messages: [],
            aiChatId: undefined,
            sessionSummary: null,
            snippet: "",
            updatedAt: nowTime(),
          };
        }
        return item;
      });
      migrateThreadTaskState(source.id, nextId);
    }
    hasMessages = threadHasTurns(
      migrated.find((item) => item.id === nextId),
    );
    flushSync(() => {
      threadIdRef.current = tid;
      setThreadId(tid);
    });
    setThreads(() => migrated);
    setView("space");
    setProjectId(projectKey);
    setSpaceId(space);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setDrafting(!hasMessages);
    setPanelIntent("execute");
    if (space === "build") setBuildTool("preview");
    if (space === "research") setResearchTool("browser");
    setPanelMode("split");
    // Mobile: land on project chat first (Build/Explore via the labeled arrow).
    requestMobileSurfaceEnter("forward");
    setMobileSurface("chat");
    pushTarget({
      view: "space",
      spaceId: space,
      threadId: tid,
      projectId: projectKey,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
    return tid;
  }, [workspaceId, actor.id, pushTarget]);

  /** Leave a project/entity and return to the space directory on the panel. */
  const backToSpaceHome = useCallback(() => {
    if (!spaceId) return;
    // Same 500ms push/pop curve as chat ↔ Build/Explore (enter from left).
    requestMobileSurfaceEnter("back");
    const chatSpace = chatSpaceId(spaceId);
    const chatWasOpen = Boolean(threadId) || drafting;
    let tid: string | null = threadId;
    let hasMessages = Boolean(thread);
    if (chatSpace && isChatSpace(chatSpace) && chatWasOpen) {
      setThreads((current) => {
        const { threads: next, id: nextId } = upsertPersistentSpaceThread(
          current,
          workspaceId,
          chatSpace,
        );
        tid = nextId;
        hasMessages = threadHasTurns(next.find((item) => item.id === nextId));
        return next;
      });
    }
    setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setView("space");
    setMobileSurface("panel");
    layoutSnapshot.current = null;
    setExpandedLayout(false);
    setExpandedPinned(false);
    if (chatSpace && chatWasOpen) {
      setThreadId(tid);
      setDrafting(!hasMessages);
      setPanelIntent("execute");
      setPanelMode("split");
    } else {
      setThreadId(null);
      setDrafting(false);
      setPanelIntent("browse");
      setPanelMode("collapsed");
    }
    pushTarget({
      view: "space",
      spaceId,
      threadId: chatSpace && chatWasOpen ? tid : null,
      projectId: null,
      panelMode: chatSpace && chatWasOpen ? "split" : "collapsed",
      panelIntent: chatSpace && chatWasOpen ? "execute" : "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [spaceId, threadId, drafting, thread, workspaceId, pushTarget]);

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
      if (found.spaceId === "build") setBuildTool("preview");
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
        skillId: null,
      });
    },
    [threads, workspaceId, pushTarget],
  );

  const openProjectChat = useCallback(
    (id: string) => {
      const ctx = { workspaceId, actorId: actor.id };
      const fromStore = localSpaceEntityStore.getProject(ctx, id);
      const legacy = findProjectInWorkspace(workspaceId, id);
      if (!fromStore && !legacy) return;
      const linked = legacy
        ? latestThreadForProject(threads, legacy)
        : threads.find((item) => item.projectId === id);
      if (linked) {
        openThread(linked.id);
        return;
      }
      openProject(id);
    },
    [threads, openThread, openProject, workspaceId, actor.id],
  );

  const openShared = useCallback(() => {
    setView("shared");
    setPanelMode("collapsed");
    setPanelIntent("browse");
    setSpaceId(null);
  }, []);

  const openSettings = useCallback((tab?: SettingsTab, opts?: { hub?: boolean }) => {
    setSettingsWorkspaceId(null);
    setSettingsOrgMemberId(null);
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

  useEffect(() => {
    registerAppActionHandlers({
      navOpen: (target) => {
        if (target.kind === "new_chat") {
          newChat();
          return { ok: true, detail: "Opened New Chat." };
        }
        if (target.kind === "recents") {
          openRecents();
          return { ok: true, detail: "Opened Recents." };
        }
        if (target.kind === "connectors") {
          openSpace("connectors");
          return { ok: true, detail: "Opened Connectors." };
        }
        if (target.kind === "settings") {
          openSettings(
            (target.tab as SettingsTab | undefined) ?? "hosting",
          );
          return { ok: true, detail: "Opened Settings." };
        }
        openSpace(target.space as NavDestinationId);
        return { ok: true, detail: `Opened ${target.space}.` };
      },
      panelOpen: (opts) => {
        if (opts.projectId) openProject(opts.projectId);
        else {
          setPanelMode("split");
          setPanelIntent("browse");
        }
        return { ok: true, detail: "Opened panel." };
      },
      panelClose: () => {
        setPanelMode("collapsed");
        return { ok: true, detail: "Closed panel." };
      },
      projectCreate: async (opts) => {
        let space = (opts.space as SpaceId) || "";
        if (space === ("explore" as SpaceId)) space = "research";
        if (!space || !["build", "research", "work"].includes(space)) {
          return {
            ok: false,
            detail: "Pick a space (Build or Explore) before creating a project.",
          };
        }
        const kind =
          (opts.kind as "app" | "research" | "general" | undefined) ??
          (space === "research"
            ? "research"
            : space === "work"
              ? "general"
              : "app");
        try {
          const api = createApiBundle(getDataBackend());
          const project = await api.entities.createProject(
            { workspaceId, actorId: actor.id },
            {
              space,
              title: opts.title,
              kind,
              summary: opts.summary ?? "",
            },
          );
          const sourceThreadId = threadIdRef.current;
          const projectThreadId = openProject(project.id, {
            migrateFromThreadId: sourceThreadId,
          });
          const taskThreadId =
            projectThreadId || threadIdRef.current || sourceThreadId || "";
          if (taskThreadId) {
            upsertThreadTaskState(taskThreadId, {
              goal: `Create project “${project.title}”`,
              step: "created",
              facts: {
                title: project.title,
                space,
                projectId: project.id,
              },
              pendingClarification: null,
              status: "completed",
            });
          }
          return {
            ok: true,
            detail: `Created “${project.title}” in ${space === "research" ? "Explore" : space === "build" ? "Build" : "Work"}.`,
            projectId: project.id,
          };
        } catch (err) {
          return {
            ok: false,
            detail:
              err instanceof Error ? err.message : "Could not create project.",
          };
        }
      },
      projectOpen: (projectIdArg) => {
        openProject(projectIdArg);
        return { ok: true, detail: `Opened project ${projectIdArg}.` };
      },
      workspaceSearch: (query) => {
        const q = query.trim().toLowerCase();
        const projects = localSpaceEntityStore
          .listAllProjects({ workspaceId, actorId: actor.id })
          .filter((p) => !q || p.title.toLowerCase().includes(q))
          .slice(0, 12)
          .map((p) => ({ id: p.id, title: p.title, space: p.space }));
        return {
          ok: true,
          detail: `Found ${projects.length} project(s).`,
          results: projects,
        };
      },
      knowledgeSearch: (query) => {
        const hits = searchWorkspaceKnowledge(workspaceId, query);
        return {
          ok: true,
          detail: `Found ${hits.length} knowledge hit(s).`,
          results: hits.map((h) => ({
            knowledgeBaseName: h.knowledgeBaseName,
            fileName: h.fileName,
            excerpt: h.excerpt,
          })),
        };
      },
      webSearch: async (query) => {
        const { searchWeb } = await import("@/lib/api/web-search-client");
        return searchWeb(query);
      },
      webOpen: async (url) => {
        const { openWebPage } = await import("@/lib/api/web-open-client");
        const page = await openWebPage(url);
        return {
          ok: page.ok,
          detail: page.error || (page.ok ? "Page opened." : "Could not open page."),
          url: page.url,
          finalUrl: page.finalUrl,
          title: page.title,
          text: page.text,
        };
      },
      askClarification: (opts) => {
        const tid = (opts.threadId?.trim() || threadIdRef.current || "").trim();
        if (!tid) {
          return { ok: false, detail: "No active chat to attach a card to." };
        }
        let questions = sanitizeClarificationQuestions(
          (opts.questions ?? []) as ClarificationQuestion[],
        );
        if (!questions.length) {
          return { ok: false, detail: "Clarification requires questions." };
        }
        const resumeTool = opts.resumeTool;
        if (
          resumeTool === "project.create" ||
          looksLikeBrokenCreateProjectCard({
            title: opts.title,
            questions,
          })
        ) {
          const knownTitle =
            typeof opts.resumeArguments?.title === "string"
              ? opts.resumeArguments.title.trim()
              : "";
          questions = knownTitle
            ? [CREATE_PROJECT_SPACE_QUESTIONS[0]!]
            : [...CREATE_PROJECT_SPACE_QUESTIONS];
          openClarificationCard({
            threadId: tid,
            title: "New project",
            description: knownTitle
              ? `We’ll create “${knownTitle}” once you pick a space.`
              : "Pick a space, then give it a name.",
            questions,
            resumeTool: "project.create",
            resumeArguments: knownTitle
              ? { ...(opts.resumeArguments ?? {}), title: knownTitle }
              : opts.resumeArguments,
          });
          upsertThreadTaskState(tid, {
            goal: knownTitle
              ? `Create project “${knownTitle}”`
              : "Create a new project",
            step: "awaiting_space_and_title",
            facts: knownTitle ? { title: knownTitle } : {},
            pendingClarification: {
              title: "New project",
              resumeTool: "project.create",
              resumeArguments: knownTitle
                ? { title: knownTitle }
                : opts.resumeArguments,
            },
            status: "awaiting_clarification",
          });
          return { ok: true, detail: "Clarification card opened." };
        }
        openClarificationCard({
          threadId: tid,
          title: opts.title,
          description: opts.description,
          questions,
          resumeTool: opts.resumeTool,
          resumeArguments: opts.resumeArguments,
        });
        upsertThreadTaskState(tid, {
          goal: opts.title,
          step: "awaiting_clarification",
          pendingClarification: {
            title: opts.title,
            resumeTool: opts.resumeTool,
            resumeArguments: opts.resumeArguments,
          },
          status: "awaiting_clarification",
        });
        return { ok: true, detail: "Clarification card opened." };
      },
      requestConfirm: (opts) => {
        const confirmed =
          typeof window !== "undefined" &&
          window.confirm(`${opts.title}\n\n${opts.message}`);
        return {
          ok: confirmed,
          detail: confirmed ? "User confirmed." : "User cancelled.",
          confirmed,
        };
      },
    });
    return () => registerAppActionHandlers(null);
  }, [
    newChat,
    openRecents,
    openSpace,
    openSettings,
    openProject,
    setPanelMode,
    setPanelIntent,
    workspaceId,
    actor.id,
    threadId,
  ]);

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

  const openSpaceSettings = useCallback(
    (space: SpaceId, options?: { tab?: string }) => {
      setSettingsSpaceId(space);
      setSettingsSpaceInitialTab(options?.tab ?? null);
      setOverlay("space-settings");
    },
    [],
  );

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setSettingsSpaceId(null);
    setSettingsSpaceInitialTab(null);
  }, []);

  const toggleVoice = useCallback(() => {
    if (!entitlements.hasVoice) return;
    if (voiceActive) {
      stopTextToSpeech();
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
      openSpaceChat(spaceId, { keepProject: Boolean(projectId) });
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
    setMobileSurface("chat");
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
  const clearEntityReference = useCallback(() => setEntityReference(null), []);

  const attachBrowserReference = useCallback(() => {
    setPageReference(browserPage);
    setEntityReference({
      type: "page",
      id: browserPage.url,
      space: "research",
      workspaceId,
      label: browserPage.title,
      snapshot: browserPage.url,
    });
  }, [browserPage, workspaceId]);

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
      if (target === "build") setBuildTool("preview");
      if (target === "research") setResearchTool("browser");
    },
    [browserPage],
  );

  const openSpaceEntity = useCallback(
    (ref: EntityRef) => {
      if (ref.workspaceId !== workspaceId) persistWorkspace(ref.workspaceId);
      if (ref.type === "project") {
        openProject(ref.id);
        return;
      }
      if (ref.type === "source") {
        setView("space");
        setSpaceId(ref.space);
        setResearchTool("browser");
        setPanelIntent("execute");
        setPanelMode("split");
        setMobileSurface("panel");
        pushTarget({
          view: "space",
          spaceId: ref.space,
          threadId,
          projectId: null,
          panelMode: "split",
          panelIntent: "execute",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }
      if (ref.type === "briefing") {
        newChat("work");
        if (ref.snapshot) {
          queueMicrotask(() => {
            sendMessage(ref.snapshot!, { space: "work" });
          });
        }
        return;
      }
      if (ref.type === "page") {
        referencePageInSpace(ref.space);
      }
    },
    [workspaceId, openProject, pushTarget, threadId, newChat, referencePageInSpace, sendMessage],
  );

  const attachReference = useCallback((ref: EntityRef) => {
    setEntityReference(ref);
    if (ref.type === "page" && ref.snapshot) {
      setPageReference({
        url: ref.snapshot,
        title: ref.label ?? "Reference",
      });
    }
  }, []);

  const promoteToWork = useCallback(
    (ref: EntityRef) => {
      localSpaceEntityStore.attachToWork(
        { workspaceId, actorId: actor.id },
        ref,
      );
    },
    [workspaceId, actor.id],
  );

  const promoteToBuild = useCallback(
    (ref: EntityRef) => {
      const ctx = { workspaceId, actorId: actor.id };
      if (ref.type === "source") {
        const project = localSpaceEntityStore.createProject(ctx, {
          space: "build",
          title: ref.label ?? "From Explore",
          kind: "app",
          summary: ref.snapshot ?? "",
        });
        localSpaceEntityStore.linkReference(ctx, ref, {
          type: "project",
          id: project.id,
          space: "build",
          workspaceId,
          label: project.title,
        });
        attachReference(ref);
        openProject(project.id);
        return;
      }
      if (ref.type === "project") {
        openProject(ref.id);
      }
    },
    [workspaceId, actor.id, attachReference, openProject],
  );

  const popEntityNavigation = useCallback(() => {
    if (projectId || connectorId || jobId || skillId) {
      backToSpaceHome();
      return;
    }
    if (hist.i > 0) goBack();
  }, [projectId, connectorId, jobId, skillId, backToSpaceHome, goBack, hist.i]);

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
    setMobileSurface("panel");
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
    setSpaceId("build");
    setFileId(id);
    setThreadId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    pushTarget({
      view: "space",
      spaceId: "build",
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
      expandedLayout,
      expandedPinned,
      toggleExpandedLayout,
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
      settingsOrgMemberId,
      setSettingsOrgMemberId,
      closeSettings,
      spaceLayout,
      setSpaceLayout,
      overlay,
      settingsSpaceId,
      settingsSpaceInitialTab,
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
      continueAfterClarification,
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
      entityReference,
      setPageReference,
      clearPageReference,
      clearEntityReference,
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
      openSpaceEntity,
      attachReference,
      promoteToWork,
      promoteToBuild,
      popEntityNavigation,
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
      expandedLayout,
      expandedPinned,
      toggleExpandedLayout,
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
      settingsOrgMemberId,
      closeSettings,
      selectSettingsTab,
      spaceLayout,
      overlay,
      settingsSpaceId,
      settingsSpaceInitialTab,
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
      continueAfterClarification,
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
      entityReference,
      setPageReference,
      clearPageReference,
      clearEntityReference,
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
      openSpaceEntity,
      attachReference,
      promoteToWork,
      promoteToBuild,
      popEntityNavigation,
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
