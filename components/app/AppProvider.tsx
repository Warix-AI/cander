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
import { CONNECTOR_CATALOG } from "@/lib/api/connector-catalog";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import { resolveChatImageUrl } from "@/lib/chat-attachment-image-url";
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
  notifyEntityStoreChange,
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
import { clearConnectorConnectionsCache } from "@/lib/connector-connections-store";
import { clearWorkspaceIcon } from "@/lib/workspace-icons";
import {
  entitlementsFor,
  homeWorkspaceId,
  workspacesFor,
  type Entitlements,
} from "@/lib/entitlements";
import {
  beginQuickSearchBrowserSession,
  clearStandaloneBrowserSession,
  endQuickSearchBrowserSession,
  isStandaloneBrowserEphemeral,
  primeStandaloneBrowserSession,
  readStandaloneBrowserPinned,
  standaloneBrowserKey,
  writeStandaloneBrowserPinned,
} from "@/lib/standalone-browser-session";
import {
  isSafeInAppBrowserUrl,
  openUrlInProjectBrowser,
  openUrlInStandaloneBrowser,
} from "@/lib/open-in-app-browser";
import {
  primeWorkItemBrowserSession,
  workItemBrowserKey,
  workItemBrowserProjectId,
} from "@/lib/work-item-browser";
import type { WorkCollectionItem } from "@/lib/work-screen-data";
import {
  DEFAULT_PANEL_RATIO,
  NEW_CHAT_CHOICE_PANEL_RATIO,
  PANEL_RATIO_OPEN_FLOOR,
} from "@/lib/right-panel";
import { isChatSpace, chatSpaceId, isDockChatSpace, PRIMARY_NAV_SPACES, resolveNavSpaceId, resolveProductSpaceId, spaceAllowed, isDashboardOnlySpace, type SidebarLayout, type SidebarNavId } from "@/lib/spaces";
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
  readSpaceLayoutPreference,
  writeSpaceLayoutPreference,
} from "@/lib/space-layout-preference";
import {
  adoptThreadAsUniversalDefault,
  isDetachedSessionChat,
  isSpaceAttachedChat,
  openSpaceDefaultChat,
  projectChatId,
  startContinuousChat,
  summarizeSession,
  threadHasTurns,
  upsertPersistentProjectThread,
  upsertPersistentConnectorThread,
} from "@/lib/persistent-chat";
import { MOBILE_PAGER_MS } from "@/lib/mobile-menu-styles";
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import {
  requestMobileSurfaceEnter,
  skipMobilePagerTransitionOnce,
  skipMobileSpaceEnterOnce,
} from "@/lib/mobile-nav-transition";
import { useMobileShell } from "@/lib/use-media-query";
import {
  collectTurnVisionImages,
  imageTurnHint,
  modelContentFromMessage,
} from "@/lib/ai/attachment-context";
import { deleteAiChat } from "@/lib/api/ai-chat-api";
import { deleteThreadsFromSupabase, replaceUniversalDefaultOnSupabase } from "@/lib/api/chat-api.supabase";
import { fetchPrivateAiReply } from "@/lib/ai/send-thread-reply";
import {
  provisionalCohortFromInput,
  startLiveTurnLatency,
  type LiveTurnLatencySession,
} from "@/lib/ai/live-turn-latency";
import { speculationFingerprint } from "@/lib/ai/composer-speculation/fingerprint";
import { isComposerSpeculationEnabled } from "@/lib/ai/composer-speculation/flags";
import { takeComposerSpeculationForSend } from "@/lib/ai/composer-speculation/session-store";
import { isRawOpenAIModeEnabled } from "@/lib/ai/raw-openai/flags";
import { detectImageGenerationIntent } from "@/lib/ai/raw-openai/image-generation";
import {
  cancelImageGenerationJob,
  createGeneratingImageBlock,
  newClientImageGenerationId,
  startImageGenerationJob,
  waitForImageGenerationJob,
} from "@/lib/ai/raw-openai/image-jobs-client";
import {
  linkRawOpenAIAttachments,
  uploadRawOpenAIAttachment,
} from "@/lib/ai/raw-openai/upload-client";
import { speakText, stopTextToSpeech } from "@/lib/voice/text-to-speech";
import { searchWorkspaceKnowledge } from "@/lib/knowledge/search";
import { typewriterReveal } from "@/lib/ai/typewriter";
import { patchMessageWithProgress } from "@/lib/ai/turn-activity";
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
  standaloneBrowserOpen?: boolean;
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
  selectedConnectionId?: string | null;
  selectedConnectionIds?: string[] | null;
  scopedConnectorId?: string | null;
  /** Inline composer connectors for the user bubble (and AI scope labels). */
  composerConnectors?: Array<{
    connectionId: string;
    connectorId: string;
    label: string;
  }> | null;
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
  /** Chat or panel underneath an open menu — drives peek strip + restore on close. */
  mobileContentSurface: "chat" | "panel";
  setMobileSurface: React.Dispatch<React.SetStateAction<MobileSurface>>;
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
  openSpaceChat: (
    space: SpaceId,
    opts?: { keepProject?: boolean; landOnPanel?: boolean },
  ) => void;
  setChatSpace: (id: SpaceId | null) => void;
  armChatInterface: (id: SpaceId) => void;
  /** Attach a space panel to the current chat without switching threads. */
  selectChatSpace: (
    id: SpaceId,
    opts?: { researchTool?: ResearchTool },
  ) => void;
  /** Create a Build / Explore project from the active draft chat. */
  startDraftProject: (space: SpaceId) => Promise<void>;
  /** Promote the draft chat to the default across Work, Build, Explore, and Connectors. */
  setDraftAsDefaultChat: (destSpace?: "work" | "build" | "research" | "studio") => void;
  collapseDraft: () => void;
  /** Close space chat and restore the full workspace dashboard. */
  closeSpaceChat: () => void;
  clearSessionSummary: (threadId?: string | null) => void;
  updateSessionSummary: (text: string, threadId?: string | null) => void;
  clearPersistentChat: (threadId?: string | null) => void;
  deleteChat: (id?: string | null) => boolean;
  deleteProjectCompletely: (projectId: string) => Promise<void>;
  sendMessage: (text: string, opts?: SendOpts) => void;
  /** After a clarification card submit — persist answers and continue the assistant. */
  continueAfterClarification: (result: ClarificationSubmitResult) => void;
  openSpace: (id: NavDestinationId) => void;
  openRecents: () => void;
  openBrowser: (opts?: { chat?: boolean; query?: string }) => void;
  /** Open an http(s) citation in the in-app browser (not a new OS tab). */
  openInAppBrowser: (url: string, opts?: { title?: string }) => void;
  standaloneBrowserOpen: boolean;
  standaloneBrowserEphemeral: boolean;
  openStandaloneBrowser: (opts?: { query?: string }) => void;
  openQuickSearchBrowser: () => void;
  closeStandaloneBrowser: () => void;
  toggleStandaloneBrowser: () => void;
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
  cancelImageGeneration: (
    generationId: string,
    threadId: string,
    messageId: string,
  ) => void;
  retryImageGeneration: (
    generationId: string,
    threadId: string,
    messageId: string,
    prompt: string,
  ) => void;
  /** True while a reply is streaming/pending or an image job is generating. */
  turnActive: boolean;
  /** Stop the in-flight chat turn and/or cancel generating images. */
  stopTurn: () => void;
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
    opts?: { migrateFromThreadId?: string | null; landOnPanel?: boolean },
  ) => string | null;
  /** Open a Work space collection item in the browser panel without switching chat. */
  openWorkItem: (item: WorkCollectionItem) => void;
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
  const [panelRatio, setPanelRatioState] = useState(DEFAULT_PANEL_RATIO);
  const [expandedLayout, setExpandedLayout] = useState(false);
  const [expandedPinned, setExpandedPinned] = useState(false);
  const layoutSnapshot = useRef<{
    sidebarOpen: boolean;
    workspaceRailOpen: boolean;
    panelRatio: number;
    panelMode: PanelMode;
  } | null>(null);
  const [mobileSurface, setMobileSurfaceState] = useState<MobileSurface>("chat");
  const mobileContentSurfaceRef = useRef<"chat" | "panel">("chat");
  const setMobileSurface = useCallback(
    (value: MobileSurface | ((prev: MobileSurface) => MobileSurface)) => {
      setMobileSurfaceState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        if (next === "chat" || next === "panel") {
          mobileContentSurfaceRef.current = next;
        }
        if (next !== prev && next !== "chat") {
          dismissNativeKeyboard();
        }
        return next;
      });
    },
    [],
  );
  const mobileContentSurface: "chat" | "panel" =
    mobileSurface === "menu"
      ? mobileContentSurfaceRef.current
      : mobileSurface === "panel"
        ? "panel"
        : "chat";
  const [mobileMenuScreen, setMobileMenuScreen] =
    useState<MobileMenuScreen>("main");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceRailOpen, setWorkspaceRailOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [buildTool, setBuildTool] = useState<BuildTool>("preview");
  const [studioTool, setStudioTool] = useState<StudioTool>("canvas");
  const [researchTool, setResearchTool] = useState<ResearchTool>("overview");
  const [standaloneBrowserOpen, setStandaloneBrowserOpen] = useState(false);
  const [standaloneBrowserEphemeral, setStandaloneBrowserEphemeral] =
    useState(false);
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
  const [spaceLayout, setSpaceLayoutState] = useState<SpaceLayout>(
    readSpaceLayoutPreference,
  );
  const setSpaceLayout = useCallback((layout: SpaceLayout) => {
    setSpaceLayoutState(layout);
    writeSpaceLayoutPreference(layout);
  }, []);
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
  const panelRevealTimer = useRef<number | null>(null);
  const PANEL_REVEAL_DELAY_MS = 1000;

  const clearPanelReveal = useCallback(() => {
    if (panelRevealTimer.current) {
      window.clearTimeout(panelRevealTimer.current);
      panelRevealTimer.current = null;
    }
  }, []);

  const schedulePanelReveal = useCallback(
    (delayMs = PANEL_REVEAL_DELAY_MS) => {
      clearPanelReveal();
      panelRevealTimer.current = window.setTimeout(() => {
        panelRevealTimer.current = null;
        setPanelMode("split");
      }, delayMs);
    },
    [clearPanelReveal],
  );

  useEffect(() => {
    return () => {
      if (mobileNavTimer.current) clearTimeout(mobileNavTimer.current);
      if (panelRevealTimer.current) clearTimeout(panelRevealTimer.current);
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
    const spaceId = resolveProductSpaceId(snap.spaceId) ?? snap.spaceId;
    const normalized =
      spaceId !== snap.spaceId ? { ...snap, spaceId } : snap;
    setView(normalized.view);
    setSpaceId(normalized.spaceId);
    setThreadId(normalized.threadId);
    setProjectId(normalized.projectId);
    setPanelMode(normalized.panelMode);
    setPanelIntent(normalized.panelIntent);
    setConnectorId(normalized.connectorId);
    setJobId(normalized.jobId);
    setSkillId(normalized.skillId);
    const pinned = readStandaloneBrowserPinned(actor.id, workspaceId);
    const browserOpen =
      normalized.standaloneBrowserOpen ??
      (normalized.view === "chat" &&
        !normalized.spaceId &&
        !normalized.projectId &&
        pinned);
    setStandaloneBrowserOpen(Boolean(browserOpen));
    setDrafting(false);
  }, [actor.id, workspaceId]);

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

      clearConnectorConnectionsCache();

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
        if (prevSpace === "research") setResearchTool("overview");

        if (chatWasOpen && isDockChatSpace(prevSpace)) {
          let tid = "";
          let hasMessages = false;
          setThreads((current) => {
            const { threads: next, id: nextId } = openSpaceDefaultChat(
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
      const pinned = readStandaloneBrowserPinned(actor.id, id);
      setView("chat");
      setSpaceId(null);
      setDrafting(false);
      setStandaloneBrowserOpen(pinned);
      setPanelMode(pinned ? "split" : "collapsed");
      setMobileSurface(pinned ? "panel" : "chat");
      setPanelIntent("browse");
      pushTarget({
        view: "chat",
        spaceId: null,
        threadId: null,
        projectId: null,
        panelMode: pinned ? "split" : "collapsed",
        panelIntent: "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
        standaloneBrowserOpen: pinned || undefined,
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
      clearConnectorConnectionsCache();
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
    setPanelRatioState((ratio) =>
      ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
    );
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
    (space: SpaceId, opts?: { keepProject?: boolean; landOnPanel?: boolean }) => {
      const product = resolveProductSpaceId(space) ?? space;
      // Nav opens map Build → Create; keepProject preserves the project's space id.
      const dest = (
        opts?.keepProject ? product : resolveNavSpaceId(space) ?? product
      ) as SpaceId;
      if (!isDockChatSpace(dest)) return;
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
                dest,
              )
            : openSpaceDefaultChat(
                current,
                workspaceId,
                dest,
              );
        tid = result.id;
        hasMessages = threadHasTurns(
          result.threads.find((item) => item.id === result.id),
        );
        return result.threads;
      });
      setThreadId(tid);
      setSpaceId(dest);
      if (!keepProject) setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setView("space");
      setPanelIntent("execute");
      setPanelMode("split");
      if (mobile) {
        skipMobilePagerTransitionOnce();
      }
      const landOnPanel = opts?.landOnPanel ?? true;
      setMobileSurface(mobile ? (landOnPanel ? "panel" : "chat") : "chat");
      setDrafting(!hasMessages);
      if (dest === "build") setBuildTool("preview");
      if (dest === "research") setResearchTool("overview");
      if (dest === "studio") setStudioTool("canvas");
      pushTarget({
        view: "space",
        spaceId: dest,
        threadId: tid,
        projectId: keepProject ? projectId : null,
        panelMode: "split",
        panelIntent: "execute",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [workspaceId, pushTarget, projectId, mobile],
  );

  const applyHomeNewChat = useCallback(() => {
    let tid = "";
    const key = standaloneBrowserKey(actor.id, workspaceId);
    if (isStandaloneBrowserEphemeral()) {
      endQuickSearchBrowserSession(key);
      setStandaloneBrowserEphemeral(false);
    } else {
      clearStandaloneBrowserSession(key);
      writeStandaloneBrowserPinned(actor.id, workspaceId, false);
    }
    setThreads((current) => {
      const { threads: next, id } = startContinuousChat(
        current,
        workspaceId,
        null,
      );
      tid = id;
      return next;
    });
    setThreadId(tid);
    setSpaceId(null);
    setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setView("chat");
    setDrafting(true);
    setPanelIntent("browse");
    setStandaloneBrowserOpen(false);
    setBrowserSearch(null);
    setPageReference(null);
    setEntityReference(null);
    // Stay collapsed until the first message is sent (schedulePanelReveal).
    setPanelMode("collapsed");
    setPanelRatioState(NEW_CHAT_CHOICE_PANEL_RATIO);
    setMobileSurface("chat");
    pushTarget({
      view: "chat",
      spaceId: null,
      threadId: tid,
      projectId: null,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
      standaloneBrowserOpen: false,
    });
  }, [pushTarget, workspaceId, actor.id]);

  const newChat = useCallback(
    (space?: SpaceId) => {
      if (space && isChatSpace(space) && projectId && spaceId === space) {
        let tid = "";
        let hasMessages = false;
        const key = standaloneBrowserKey(actor.id, workspaceId);
        if (isStandaloneBrowserEphemeral()) {
          endQuickSearchBrowserSession(key);
          setStandaloneBrowserEphemeral(false);
        } else if (standaloneBrowserOpen) {
          clearStandaloneBrowserSession(key);
          writeStandaloneBrowserPinned(actor.id, workspaceId, false);
        }
        setStandaloneBrowserOpen(false);
        setBrowserSearch(null);
        setPageReference(null);
        setEntityReference(null);
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
        if (space === "research") setResearchTool("overview");
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
          standaloneBrowserOpen: false,
        });
        return;
      }

      if (space && isChatSpace(space)) {
        // New chat stays detached from spaces until Default chat; keep the
        // current space lens/panel so the user can still promote it.
        let tid = "";
        let hasMessages = false;
        const key = standaloneBrowserKey(actor.id, workspaceId);
        if (isStandaloneBrowserEphemeral()) {
          endQuickSearchBrowserSession(key);
          setStandaloneBrowserEphemeral(false);
        } else if (standaloneBrowserOpen) {
          clearStandaloneBrowserSession(key);
          writeStandaloneBrowserPinned(actor.id, workspaceId, false);
        }
        setStandaloneBrowserOpen(false);
        setBrowserSearch(null);
        setPageReference(null);
        setEntityReference(null);
        setThreads((current) => {
          const { threads: next, id } = startContinuousChat(
            current,
            workspaceId,
            null,
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
        if (space === "research") setResearchTool("overview");
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
          standaloneBrowserOpen: false,
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
      actor.id,
      standaloneBrowserOpen,
    ],
  );

  const openCourierHome = useCallback(() => {
    newChat();
  }, [newChat]);

  const setChatSpace = useCallback((id: SpaceId | null) => {
    setSpaceId(id);
    setView("chat");
    if (id === "research") setResearchTool("overview");
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
        const { threads: next, id: nextId } = openSpaceDefaultChat(
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
      if (id === "research") setResearchTool("overview");
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
      if (id === "research")
        setResearchTool(opts?.researchTool ?? "overview");
      if (threadId && !projectId) {
        setThreads((current) =>
          current.map((item) =>
            item.id === threadId ? { ...item, spaceId: id } : item,
          ),
        );
      }
    },
    [threadId, projectId],
  );

  const promoteThreadToUniversalDefault = useCallback(
    (sourceThreadId: string) => {
      let tid = sourceThreadId;
      let removedIds: string[] = [];
      let promoted: Thread | null = null;
      setThreads((current) => {
        const result = adoptThreadAsUniversalDefault(
          current,
          workspaceId,
          sourceThreadId,
        );
        tid = result.id;
        removedIds = result.removedIds;
        promoted = result.promoted;
        return result.threads;
      });
      if (promoted && isSupabaseConfigured()) {
        // Hard replace on the server so hydrate cannot re-merge the old transcript.
        void replaceUniversalDefaultOnSupabase(
          { workspaceId, actorId: actor.id },
          promoted,
          removedIds,
        ).catch((err) => {
          console.warn("[cander] replace universal default failed", err);
          if (removedIds.length) {
            void deleteThreadsFromSupabase(
              { workspaceId, actorId: actor.id },
              removedIds,
            ).catch(() => {
              /* best-effort fallback */
            });
          }
        });
      } else if (removedIds.length && isSupabaseConfigured()) {
        void deleteThreadsFromSupabase(
          { workspaceId, actorId: actor.id },
          removedIds,
        ).catch((err) => {
          console.warn("[cander] delete replaced chats failed", err);
        });
      }
      return tid;
    },
    [setThreads, workspaceId, actor.id],
  );

  const setDraftAsDefaultChat = useCallback(
    (destSpace: "work" | "build" | "research" | "studio" = "work") => {
      if (!threadId) return;
      const tid = promoteThreadToUniversalDefault(threadId);
      setThreadId(tid);
      setDrafting(false);
      setProjectId(null);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      // Open the target space with the shared default so every dock resumes it.
      setSpaceId(destSpace);
      setView("space");
      setPanelIntent("execute");
      setPanelMode("collapsed");
      setMobileSurface("chat");
      if (destSpace === "build") setBuildTool("preview");
      if (destSpace === "research") setResearchTool("overview");
      if (destSpace === "studio") setStudioTool("canvas");
      if (mobile) {
        skipMobilePagerTransitionOnce();
      }
      pushTarget({
        view: "space",
        spaceId: destSpace,
        threadId: tid,
        projectId: null,
        panelMode: "collapsed",
        panelIntent: "execute",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
      schedulePanelReveal();
    },
    [
      threadId,
      promoteThreadToUniversalDefault,
      pushTarget,
      mobile,
      schedulePanelReveal,
    ],
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

  const deleteChat = useCallback(
    (id?: string | null) => {
      const target = id ?? threadId;
      if (!target) return false;
      const row = threads.find((item) => item.id === target);
      if (row?.projectId) return false;
      if (
        row?.aiChatId &&
        !row.aiChatId.startsWith("local-") &&
        supabaseUser
      ) {
        void deleteAiChat(row.aiChatId).catch(() => {
          // Still remove locally when offline or already deleted server-side.
        });
      }
      setThreads((current) => current.filter((item) => item.id !== target));
      if (threadId === target) {
        setThreadId(null);
        setDrafting(true);
        if (projectId) {
          setMobileSurface("panel");
        }
      }
      return true;
    },
    [threadId, threads, supabaseUser, projectId],
  );

  const patchImageGenerationBlock = useCallback(
    (
      threadId: string,
      messageId: string,
      generationId: string,
      patch: Partial<{
        status: "generating" | "completed" | "failed" | "cancelled";
        imageUrl: string | null;
        error?: string;
        attachmentId?: string;
        openaiFileId?: string;
        mime?: string;
        name?: string;
      }>,
    ) => {
      setThreads((current) =>
        current.map((item) => {
          if (item.id !== threadId) return item;
          return {
            ...item,
            updatedAt: new Date().toISOString(),
            messages: item.messages.map((message) => {
              if (message.id !== messageId) return message;
              return {
                ...message,
                blocks: (message.blocks || []).map((block) => {
                  if (
                    block.type !== "image_generation" ||
                    block.generationId !== generationId
                  ) {
                    return block;
                  }
                  const next = { ...block, ...patch };
                  if (
                    next.status === "completed" &&
                    (next.imageUrl?.trim() || patch.attachmentId)
                  ) {
                    const durable = resolveChatImageUrl({
                      attachmentId: next.attachmentId ?? patch.attachmentId,
                      dataUrl: next.imageUrl,
                    });
                    if (durable) next.imageUrl = durable;
                  }
                  return next;
                }),
              };
            }),
          };
        }),
      );
    },
    [setThreads],
  );

  const imageJobPollRef = useRef(new Set<string>());
  const turnAbortRef = useRef<AbortController | null>(null);

  const trackImageGenerationJob = useCallback(
    async (opts: {
      generationId: string;
      prompt: string;
      threadId: string;
      messageId: string;
      workspaceId?: string | null;
      /** `poll` resumes an existing job after reload — do not POST a new job. */
      mode?: "start" | "poll";
    }) => {
      if (imageJobPollRef.current.has(opts.generationId)) return;
      imageJobPollRef.current.add(opts.generationId);
      try {
        if (opts.mode !== "poll") {
          const started = await startImageGenerationJob({
            prompt: opts.prompt,
            generationId: opts.generationId,
            threadId: opts.threadId,
            messageId: opts.messageId,
            workspaceId: opts.workspaceId ?? workspaceId,
          });
          if (!started.ok) {
            const transient =
              /network_error|failed to fetch|abort|load failed|timeout/i.test(
                started.error,
              );
            if (!transient) {
              patchImageGenerationBlock(
                opts.threadId,
                opts.messageId,
                opts.generationId,
                { status: "failed", error: started.error },
              );
              return;
            }
            // Keep generating + poll — leave/reload often aborts the start POST.
          } else if (started.status === "completed" && started.dataUrl) {
            patchImageGenerationBlock(
              opts.threadId,
              opts.messageId,
              opts.generationId,
              {
                status: "completed",
                imageUrl: started.dataUrl,
                mime: started.mimeType || "image/png",
                name: "generated.png",
                attachmentId: started.attachmentId,
                openaiFileId: started.openaiFileId,
              },
            );
            if (started.attachmentId) {
              void linkRawOpenAIAttachments({
                attachmentIds: [started.attachmentId],
                messageId: opts.messageId,
                threadId: opts.threadId,
              });
            }
            return;
          } else if (started.status === "failed") {
            patchImageGenerationBlock(
              opts.threadId,
              opts.messageId,
              opts.generationId,
              {
                status: "failed",
                error: started.error || "Image generation failed.",
              },
            );
            return;
          }
        }
        const result = await waitForImageGenerationJob(opts.generationId, {
          intervalMs: 1200,
          timeoutMs: 180_000,
        });
        if (result.status === "completed" && result.dataUrl) {
          patchImageGenerationBlock(
            opts.threadId,
            opts.messageId,
            opts.generationId,
            {
              status: "completed",
              imageUrl: result.dataUrl,
              mime: result.mimeType || "image/png",
              name: "generated.png",
              attachmentId: result.attachmentId,
              openaiFileId: result.openaiFileId,
            },
          );
          if (result.attachmentId) {
            void linkRawOpenAIAttachments({
              attachmentIds: [result.attachmentId],
              messageId: opts.messageId,
              threadId: opts.threadId,
            });
          }
          return;
        }
        if (result.status === "cancelled") {
          patchImageGenerationBlock(
            opts.threadId,
            opts.messageId,
            opts.generationId,
            { status: "cancelled", imageUrl: null },
          );
          return;
        }
        patchImageGenerationBlock(
          opts.threadId,
          opts.messageId,
          opts.generationId,
          {
            status: "failed",
            error: result.error || "Image generation failed.",
            imageUrl: null,
          },
        );
      } finally {
        imageJobPollRef.current.delete(opts.generationId);
      }
    },
    [patchImageGenerationBlock, workspaceId],
  );

  const cancelImageGeneration = useCallback(
    (generationId: string, threadId: string, messageId: string) => {
      patchImageGenerationBlock(threadId, messageId, generationId, {
        status: "cancelled",
        imageUrl: null,
      });
      void cancelImageGenerationJob(generationId);
    },
    [patchImageGenerationBlock],
  );

  const retryImageGeneration = useCallback(
    (
      _oldGenerationId: string,
      threadId: string,
      messageId: string,
      prompt: string,
    ) => {
      const generationId = newClientImageGenerationId();
      setThreads((current) =>
        current.map((item) => {
          if (item.id !== threadId) return item;
          return {
            ...item,
            messages: item.messages.map((message) => {
              if (message.id !== messageId) return message;
              return {
                ...message,
                blocks: [
                  createGeneratingImageBlock({ generationId, prompt }),
                ],
              };
            }),
          };
        }),
      );
      void trackImageGenerationJob({
        generationId,
        prompt,
        threadId,
        messageId,
      });
    },
    [setThreads, trackImageGenerationJob],
  );

  const turnActive = useMemo(() => {
    if (!thread) return false;
    return thread.messages.some(
      (message) =>
        message.status === "pending" ||
        message.status === "streaming" ||
        Boolean(
          message.blocks?.some(
            (b) =>
              b.type === "image_generation" && b.status === "generating",
          ),
        ),
    );
  }, [thread]);

  const stopTurn = useCallback(() => {
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;
    if (!thread) return;
    const tid = thread.id;
    for (const message of thread.messages) {
      for (const block of message.blocks || []) {
        if (
          block.type === "image_generation" &&
          block.status === "generating"
        ) {
          cancelImageGeneration(block.generationId, tid, message.id);
        }
      }
    }
    setThreads((current) =>
      current.map((item) => {
        if (item.id !== tid) return item;
        return {
          ...item,
          updatedAt: new Date().toISOString(),
          messages: item.messages.map((message) => {
            if (
              message.role === "assistant" &&
              (message.status === "pending" || message.status === "streaming")
            ) {
              return {
                ...message,
                status: "complete" as const,
                activity: null,
                content: message.content?.trim() ? message.content : "",
              };
            }
            return message;
          }),
        };
      }),
    );
  }, [thread, cancelImageGeneration, setThreads]);

  // Resume polling for generating image jobs after reload / hydrate.
  useEffect(() => {
    for (const t of threads) {
      for (const m of t.messages) {
        for (const b of m.blocks || []) {
          if (b.type !== "image_generation" || b.status !== "generating") continue;
          void trackImageGenerationJob({
            generationId: b.generationId,
            prompt: b.prompt,
            threadId: t.id,
            messageId: m.id,
            mode: "poll",
          });
        }
      }
    }
  }, [threads, trackImageGenerationJob]);

  const sendMessage = useCallback(
    (text: string, opts?: SendOpts) => {
      const sendAttachments = opts?.sendAttachments ?? [];
      const selectedConnectionId = opts?.selectedConnectionId ?? null;
      const selectedConnectionIds =
        opts?.selectedConnectionIds?.filter(Boolean) ??
        (selectedConnectionId ? [selectedConnectionId] : []);
      const composerConnectors = (opts?.composerConnectors ?? []).filter(
        (c) => c.connectionId && c.connectorId && c.label,
      );
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
          mimeType: a.mimeType,
          size: a.size,
          ...(a.blob ? { blob: a.blob } : {}),
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
      const kindRaw = classifyTurn(contentForIntent);
      const kind =
        kindRaw === "connect" && !connectService(contentForIntent)
          ? "chat"
          : kindRaw;
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
      const connectorBlocks = composerConnectors.map((item) => ({
        type: "user_connector" as const,
        connectionId: item.connectionId,
        connectorId: item.connectorId,
        label: item.label,
      }));
      const displayBlocks = [
        ...imageBlocks,
        ...fileBlocks,
        ...connectorBlocks,
      ];
      // Bubble shows typed text with connector labels in chip slots.
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
        // One activity row for the whole turn — timer starts here.
        assistantMsg = {
          ...assistantMsg,
          content: "",
          status: "pending",
          activity: {
            phase: "generating",
            startedAt: Date.now(),
            kind: "idle",
          },
        };
      }

      // Async image generation — placeholder card immediately; no chat lock.
      const imageGenIntent =
        useLiveAi &&
        isRawOpenAIModeEnabled() &&
        detectImageGenerationIntent(trimmed, {
          space: chatSpaceId(space) ?? space ?? spaceId,
        }) &&
        attachments.length === 0 &&
        fileAttachments.length === 0;
      let imageGenerationId: string | null = null;
      if (imageGenIntent) {
        imageGenerationId = newClientImageGenerationId();
        assistantMsg = {
          ...assistantMsg,
          content: "",
          status: "complete",
          activity: null,
          blocks: [
            createGeneratingImageBlock({
              generationId: imageGenerationId,
              prompt: trimmed,
            }),
          ],
        };
        console.log("[IMAGE_JOB]", {
          event: "image_intent_detected",
          generationId: imageGenerationId,
        });
      }

      const turnVision = collectTurnVisionImages(attachments.map((a) => a.url));
      const imageUrls = turnVision.ok ? turnVision.urls : [];
      const rawMode = isRawOpenAIModeEnabled();
      // Only mention images to the model when real bytes will be sent.
      // Raw OpenAI uploads files via file_id — don't inline document text.
      const aiUserContent = [
        trimmed,
        ...(rawMode
          ? []
          : fileAttachments.map((f) =>
              f.text?.trim()
                ? `File “${f.name}” contents:\n${f.text.trim()}`
                : `File attached: ${f.name}`,
            )),
        ...(imageUrls.length && !rawMode ? [imageTurnHint(imageUrls.length)] : []),
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
        if (service) {
          assistantMsg = {
            ...assistantMsg,
            content: `Let’s connect ${service.service}. I’ll keep keys out of the source.`,
            blocks: [{ type: "connect", service: service.service, status: "pending" }],
          };
        }
      } else if (kind === "secret") {
        const service = connectService(trimmed);
        if (service) {
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
        }
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
      const useContinuousPersistent =
        !projectId &&
        !intent.projectId &&
        (view === "space" ||
          view === "chat" ||
          Boolean(opts?.space) ||
          space === "connectors");
      const usePersistent = useProjectPersistent || useContinuousPersistent;
      let activeId = threadId ?? nextId("t");
      // Detached New Chat sessions stay unattached until Default chat —
      // even if the UI still shows a space lens.
      const detachedDraft =
        isDetachedSessionChat(thread, workspaceId) ||
        (view === "chat" && !spaceId && !opts?.space && !projectId);

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
        } else if (useContinuousPersistent) {
          if (detachedDraft) {
            // Always land on a real session id — never mint orphan `t-xxxxx`
            // threads when React threadId was cleared mid-chat.
            if (
              threadId &&
              list.some(
                (item) =>
                  item.id === threadId && item.workspaceId === workspaceId,
              )
            ) {
              activeId = threadId;
            } else {
              const started = startContinuousChat(list, workspaceId, null);
              list = started.threads;
              activeId = started.id;
            }
          } else {
            const lens =
              chatSpace ??
              (spaceId && isDockChatSpace(spaceId)
                ? spaceId
                : thread?.spaceId && isDockChatSpace(thread.spaceId)
                  ? thread.spaceId
                  : "work");
            const upserted = openSpaceDefaultChat(list, workspaceId, lens);
            list = upserted.threads;
            activeId = upserted.id;
          }
        }
        const existing = list.find((item) => item.id === activeId);
        let next = existing
          ? list.map((item) =>
              item.id === existing.id
                ? {
                    ...item,
                    title: item.messages.length ? item.title : displayText.slice(0, 48),
                    snippet: displayText,
                    updatedAt: new Date().toISOString(),
                    // Detached drafts must not inherit the current space lens.
                    spaceId: detachedDraft
                      ? item.spaceId
                      : (chatSpace ?? item.spaceId ?? undefined),
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
            )
          : [
              {
                id: activeId,
                title: displayText.slice(0, 52),
                workspaceId: matched?.workspaceId ?? workspaceId,
                projectId: useProjectPersistent ? projectId ?? undefined : intent.projectId,
                spaceId: detachedDraft
                  ? undefined
                  : (chatSpace ?? undefined),
                updatedAt: new Date().toISOString(),
                snippet: displayText,
                messages: [userMsg, assistantMsg],
                persistent: usePersistent || undefined,
                sessionSummary: null,
                createdBy: actor.id,
              } satisfies Thread,
              ...list,
            ];

        return next;
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
        if (service) {
          setMemory((current) => ({
            ...current,
            integrations: current.integrations.includes(service.service)
              ? current.integrations
              : [...current.integrations, service.service],
          }));
        }
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
            id: m.id,
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
        const rawMode = isRawOpenAIModeEnabled();
        // Prefer current-turn bytes; never call the model with name-only image claims.
        if (!rawMode && attachments.length > 0 && imageUrls.length === 0) {
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

        const latency: LiveTurnLatencySession = startLiveTurnLatency({
          threadId: activeId,
          workspaceId: matched?.workspaceId ?? workspaceId,
          assistantMessageId: assistantId,
          provisionalCohort: provisionalCohortFromInput({
            text: aiUserContent || trimmed,
            selectedConnectionCount: selectedConnectionIds.length,
            attachmentCount:
              sendAttachments.length ||
              attachments.length ||
              fileAttachments.length,
          }),
          historyMessageCount: historyMessages.length,
          attachmentCount:
            sendAttachments.length ||
            attachments.length ||
            fileAttachments.length,
          selectedConnectionCount: selectedConnectionIds.length,
        });
        latency.mark("context_ready");

        const runReply = async () => {
          turnAbortRef.current?.abort();
          const ac = new AbortController();
          turnAbortRef.current = ac;
          let attachmentIds: string[] = [];
          if (rawMode && (sendAttachments.length > 0 || attachments.length > 0 || fileAttachments.length > 0)) {
            setThreads((current) =>
              current.map((item) => ({
                ...item,
                messages: item.messages.map((message) =>
                  message.id === assistantId
                    ? patchMessageWithProgress(message, {
                        phase: "thinking",
                        label: "Uploading",
                        detail: "Sending attachments to OpenAI",
                      })
                    : message,
                ),
              })),
            );
            try {
              const toUpload =
                sendAttachments.length > 0
                  ? sendAttachments
                  : [
                      ...attachments.map((a, i) => ({
                        id: `img_${i}`,
                        type: "image" as const,
                        filename: a.name,
                        mimeType: a.mime,
                        size: 0,
                        dataUrl: a.url,
                      })),
                      ...fileAttachments.map((f, i) => ({
                        id: `file_${i}`,
                        type: "file" as const,
                        filename: f.name,
                        mimeType: f.mimeType || "application/octet-stream",
                        size: f.size ?? 0,
                        ...(f.blob ? { blob: f.blob } : {}),
                        ...(f.text ? { text: f.text } : {}),
                      })),
                    ];
              for (const att of toUpload) {
                if (att.type === "file" && att.blob) {
                  const uploaded = await uploadRawOpenAIAttachment({
                    file: att.blob,
                    filename: att.filename,
                    mimeType: att.mimeType,
                    threadId: activeId,
                    attachmentType: "document",
                  });
                  attachmentIds.push(uploaded.id);
                  continue;
                }
                if (att.type === "file" && !att.blob && att.text) {
                  // text-only fallback: upload as .txt
                  const blob = new Blob([att.text], { type: "text/plain" });
                  const uploaded = await uploadRawOpenAIAttachment({
                    file: blob,
                    filename: att.filename.endsWith(".txt")
                      ? att.filename
                      : `${att.filename}.txt`,
                    mimeType: "text/plain",
                    threadId: activeId,
                    attachmentType: "document",
                  });
                  attachmentIds.push(uploaded.id);
                  continue;
                }
                if (att.type === "image" && !att.dataUrl) continue;
                if (att.type === "file" && !att.blob) {
                  throw new Error(
                    `Couldn’t read bytes for “${att.filename}”. Try uploading again.`,
                  );
                }
                const uploaded = await uploadRawOpenAIAttachment({
                  ...(att.type === "image"
                    ? { dataUrl: att.dataUrl }
                    : { file: att.blob }),
                  filename: att.filename,
                  mimeType: att.mimeType,
                  threadId: activeId,
                  attachmentType: att.type === "image" ? "image" : "document",
                });
                attachmentIds.push(uploaded.id);
              }
              await linkRawOpenAIAttachments({
                attachmentIds,
                messageId: userMsg.id,
                threadId: activeId,
              });
              latency.mark("attachments_done");
            } catch (e) {
              const msg =
                e instanceof Error ? e.message : "Attachment upload failed.";
              latency.finalize({
                outcome: "error",
                errorCode: "attachment_upload",
              });
              setThreads((current) =>
                current.map((item) => ({
                  ...item,
                  messages: item.messages.map((message) =>
                    message.id === assistantId
                      ? {
                          ...message,
                          status: "complete" as const,
                          activity: null,
                          content: msg,
                        }
                      : message,
                  ),
                })),
              );
              return;
            }
          }

          const sendContent = aiUserContent || trimmed || "(attachment)";
          if (isComposerSpeculationEnabled()) {
            const specFp = speculationFingerprint(trimmed, {
              workspaceId: matched?.workspaceId ?? workspaceId,
              connectionIds: selectedConnectionIds,
              attachmentCount:
                attachmentIds.length ||
                attachments.length ||
                fileAttachments.length,
            });
            const reused = await takeComposerSpeculationForSend({
              text: trimmed,
              fingerprint: specFp,
              waitMs: 12_000,
            });
            if (
              reused?.draftText &&
              !attachmentIds.length &&
              !imageUrls.length &&
              !fileAttachments.length &&
              sendContent === trimmed
            ) {
              console.debug("[SPECULATION_REUSE]", {
                tier: reused.tier,
                warmHandle: reused.warmHandle,
                chars: reused.draftText.length,
              });
              latency.setTransport("raw");
              latency.setSignals({
                presentationStreamed: false,
                contentStreaming: false,
              });
              latency.mark("dispatch_start");
              latency.mark("response_received");
              latency.markFirstContentReceived();
              latency.mark("reply_resolved");
              return {
                aiChatId: priorAiChatId ?? "",
                content: reused.draftText,
                offline: false,
                condensationOccurred: false,
                runtime: "speculation-draft",
                presentationStreamed: false,
              };
            }
          }

          return fetchPrivateAiReply({
            aiChatId: priorAiChatId,
            threadId: activeId,
            title: displayText.slice(0, 52) || attachments[0]?.name || "Chat",
            content: sendContent,
            workspaceId: matched?.workspaceId ?? workspaceId,
            projectId: replyProjectId,
            projectSpace: replyProjectSpace,
            messages: historyMessages,
            signal: ac.signal,
            latency,
            selectedConnectionId:
              selectedConnectionIds[0] ?? selectedConnectionId,
            selectedConnectionIds:
              selectedConnectionIds.length > 0 ? selectedConnectionIds : null,
            ...(rawMode
              ? attachmentIds.length
                ? { attachmentIds }
                : imageUrls.length
                  ? { images: imageUrls }
                  : {}
              : imageUrls.length
                ? { images: imageUrls }
                : {}),
            onProgress: (progress) => {
              if (ac.signal.aborted) return;
              if (progress.contentDelta) {
                latency.markFirstContentReceived({
                  streaming: Boolean(progress.contentStreaming),
                });
                latency.markFirstContentVisible();
              }
              if (progress.phase === "tool") {
                latency.markToolPhase();
              }
              setThreads((current) =>
                current.map((item) => ({
                  ...item,
                  messages: item.messages.map((message) => {
                    const isTarget =
                      message.id === assistantId ||
                      (message.role === "assistant" &&
                        (message.status === "pending" ||
                          message.status === "streaming") &&
                        (message.content === "Thinking…" ||
                          message.content === "Thinking..." ||
                          message.id === assistantId));
                    if (!isTarget) return message;
                    return patchMessageWithProgress(message, progress);
                  }),
                })),
              );
            },
          });
        };

        void runReply()
          .then((result) => {
            if (!result || result.cancelled) {
              latency.finalize({ outcome: "cancelled" });
              return;
            }
            latency.mark("reply_resolved");
            const replyFailed = result.runtime === "error";
            latency.setSignals({
              toolResultCount: result.toolResults?.length ?? 0,
              presentationStreamed: Boolean(result.presentationStreamed),
            });
            const finishLatency = (outcome: "ok" | "paused" | "error") => {
              latency.finalize({
                outcome: replyFailed ? "error" : outcome,
                ...(replyFailed ? { errorCode: "reply_error" } : {}),
              });
            };
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
              citations?: Message["citations"],
              blocks?: Message["blocks"],
            ) => {
              if (content) {
                latency.markFirstContentVisible();
              }
              if (status === "complete") {
                latency.mark("complete");
                latency.mark("commit");
              }
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
                                blocks: [
                                  ...(blocks ?? []),
                                  ...(message.blocks ?? []).filter(
                                    (b) => b.type !== "tool",
                                  ),
                                ],
                                ...(citations?.length
                                  ? { citations }
                                  : {}),
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

            // Presentation buffer only — model already finished; smooth visual pace.
            if (result.presentationStreamed) {
              patchAssistant(
                result.content,
                "complete",
                result.condensationOccurred,
                result.citations,
                result.blocks,
              );
              finishLatency(result.pausedForUser ? "paused" : "ok");
              if (
                result.generatedAttachmentIds?.length &&
                isRawOpenAIModeEnabled()
              ) {
                void linkRawOpenAIAttachments({
                  attachmentIds: result.generatedAttachmentIds,
                  messageId: assistantId,
                  threadId: activeId,
                });
              }
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
                done ? result.citations : undefined,
                done ? result.blocks : undefined,
              );
              if (done) {
                finishLatency(result.pausedForUser ? "paused" : "ok");
                if (
                  result.generatedAttachmentIds?.length &&
                  isRawOpenAIModeEnabled()
                ) {
                  void linkRawOpenAIAttachments({
                    attachmentIds: result.generatedAttachmentIds,
                    messageId: assistantId,
                    threadId: activeId,
                  });
                }
                if (voiceActive) {
                  speakText(sanitizeAssistantVisibleText(result.content));
                }
              }
            });
          })
          .catch((err: unknown) => {
            const cancelled =
              (err instanceof Error && err.message === "Turn cancelled.") ||
              (err instanceof DOMException && err.name === "AbortError");
            latency.finalize({
              outcome: cancelled ? "cancelled" : "error",
              errorCode: cancelled
                ? "cancelled"
                : err instanceof Error
                  ? err.name.slice(0, 40)
                  : "error",
            });
            const detail =
              err instanceof Error && err.message.trim()
                ? err.message.trim().slice(0, 280)
                : "Something went wrong generating a reply.";
            console.error("[PRIVATE_AI_REPLY_ERROR]", {
              message: detail,
              name: err instanceof Error ? err.name : typeof err,
            });
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
                        content: detail,
                      }
                    : message;
                }),
              })),
            );
          });
        };

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
      if (!onUnscopedChat && space === "build" && !projectId) setBuildTool("preview");
      if (!onUnscopedChat && space === "research" && !projectId)
        setResearchTool("overview");
      if (!onUnscopedChat && space && (kind === "build" || kind === "refine" || kind === "fix"))
        setBuildTool("preview");
      if (!onUnscopedChat && space && kind === "changes") setBuildTool("activity");
      // First turn: dock the chat first, then reveal the right panel after a beat.
      const revealPanelAfterDock =
        panelMode === "collapsed" && !threadHasTurns(thread);
      const nextPanelMode = revealPanelAfterDock ? "collapsed" : panelMode;
      setPanelMode(nextPanelMode);
      if (revealPanelAfterDock) {
        schedulePanelReveal();
      }
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
        standaloneBrowserOpen,
      });
      if (imageGenerationId) {
        void trackImageGenerationJob({
          generationId: imageGenerationId,
          prompt: trimmed,
          threadId: activeId,
          messageId: assistantId,
        });
      } else {
        kickLiveAi();
      }
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
      standaloneBrowserOpen,
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
      trackImageGenerationJob,
      schedulePanelReveal,
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
                activity: {
                  phase: "generating" as const,
                  startedAt: Date.now(),
                  kind: "idle" as const,
                },
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
            setThreads((current) =>
              current.map((item) => ({
                ...item,
                messages: item.messages.map((m) => {
                  if (m.id !== assistantId) return m;
                  return patchMessageWithProgress(m, progress);
                }),
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
                        ...(done && reply.citations?.length
                          ? { citations: reply.citations }
                          : {}),
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
    let target: NavDestinationId | null =
      resolveNavSpaceId(id) ?? id;
    if (target && !spaceAllowed(target, allowed, planOpts)) {
      target = null;
    }
    if (!target) {
      const fallback = (["research", "studio"] as const).find(
        (space) => spaceAllowed(space, allowed, planOpts),
      );
      if (!fallback) {
        newChat();
        return;
      }
      target = fallback;
    }

    const dest = target;
    if (isStandaloneBrowserEphemeral() && dest !== "research") {
      endQuickSearchBrowserSession(standaloneBrowserKey(actor.id, workspaceId));
      setStandaloneBrowserEphemeral(false);
      setStandaloneBrowserOpen(false);
    }
    // Primary spaces open the continuous chat panel (last chat), not browse-only.
    if (isChatSpace(dest)) {
      openSpaceChat(dest);
      return;
    }

    const chatActive = Boolean(threadId) || drafting;

    if (dest === spaceId && projectId && isChatSpace(dest)) {
      let tid = threadId;
      let hasMessages = Boolean(thread);
      setThreads((current) => {
        const { threads: next, id: nextId } = openSpaceDefaultChat(
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

    if (chatActive && target === spaceId && !isDashboardOnlySpace(target)) {
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
      if (chatActive) {
        if (isChatSpace(dest)) {
          openSpaceChat(dest);
          return;
        }
        setDrafting(Boolean(threadId) && drafting);
        setPanelIntent("execute");
        setPanelMode("split");
        setMobileSurface("panel");
        pushTarget({
          view: "space",
          spaceId: dest,
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
      if (mobile) {
        skipMobilePagerTransitionOnce();
        skipMobileSpaceEnterOnce();
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
    openSpaceChat,
    mobile,
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
    // Work is hidden from nav — bounce anyone still on it to Home.
    queueMicrotask(() => openSpace("research"));
  }, [spaceId, openSpace]);

  useEffect(() => {
    if (!workspaceId) return;
    setThreads((current) =>
      openSpaceDefaultChat(current, workspaceId, "work").threads,
    );
  }, [workspaceId]);

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
    opts?: { migrateFromThreadId?: string | null; landOnPanel?: boolean },
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
    if (isStandaloneBrowserEphemeral()) {
      endQuickSearchBrowserSession(standaloneBrowserKey(actor.id, workspaceId));
      setStandaloneBrowserEphemeral(false);
      setStandaloneBrowserOpen(false);
    }
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
    if (space === "research") setResearchTool("overview");
    if (space === "studio") setStudioTool("canvas");
    setPanelMode("split");
    setPanelRatioState((ratio) =>
      ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
    );
    if (opts?.landOnPanel) {
      setMobileSurface("panel");
    } else {
      // Mobile: land on project chat first (Build/Explore via the labeled arrow).
      requestMobileSurfaceEnter("forward");
      setMobileSurface("chat");
    }
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

  const openWorkItem = useCallback(
    (item: WorkCollectionItem) => {
      const browserProjectId = workItemBrowserProjectId(item);
      const key = workItemBrowserKey(actor.id, workspaceId, item);
      if (isStandaloneBrowserEphemeral()) {
        endQuickSearchBrowserSession(standaloneBrowserKey(actor.id, workspaceId));
        setStandaloneBrowserEphemeral(false);
        setStandaloneBrowserOpen(false);
      }
      primeWorkItemBrowserSession(key, item);
      const chatWasOpen = Boolean(threadId) || drafting;
      setView("space");
      setSpaceId("work");
      setProjectId(browserProjectId);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setPanelIntent(chatWasOpen ? "execute" : "browse");
      setPanelMode("split");
      setMobileSurface("panel");
      pushTarget({
        view: "space",
        spaceId: "work",
        threadId: chatWasOpen ? threadId : null,
        projectId: browserProjectId,
        panelMode: "split",
        panelIntent: chatWasOpen ? "execute" : "browse",
        connectorId: null,
        jobId: null,
        skillId: null,
      });
    },
    [workspaceId, actor.id, threadId, drafting, pushTarget],
  );

  const startDraftProject = useCallback(
    async (space: SpaceId) => {
      if (!isChatSpace(space) || (space !== "build" && space !== "research")) {
        return;
      }
      const sourceThreadId = threadIdRef.current;
      if (!sourceThreadId) return;
      const snap = threads.find((item) => item.id === sourceThreadId);
      const title =
        snap?.title && snap.title !== "Chat"
          ? snap.title
          : space === "build"
            ? "New App"
            : "Search";
      const api = createApiBundle(getDataBackend());
      const project = await api.entities.createProject(
        { workspaceId, actorId: actor.id },
        {
          space,
          title,
          kind: space === "research" ? "research" : "app",
          summary: snap?.snippet ?? "",
        },
      );
      openProject(project.id, {
        migrateFromThreadId: sourceThreadId,
        landOnPanel: true,
      });
      if (space === "build") setBuildTool("preview");
      if (space === "research") setResearchTool("overview");
    },
    [workspaceId, actor.id, threads, openProject],
  );

  /** Leave a project/entity and return to the space directory on the panel. */
  const backToSpaceHome = useCallback(() => {
    if (!spaceId) return;
    // Same 500ms push/pop curve as chat ↔ Build/Explore (enter from left).
    requestMobileSurfaceEnter("back");
    const chatSpace = chatSpaceId(spaceId);
    const chatWasOpen = Boolean(threadId) || drafting;
    let tid: string | null = threadId;
    let hasMessages = Boolean(thread);
    if (chatWasOpen) {
      setThreads((current) => {
        const { threads: next, id: nextId } = openSpaceDefaultChat(
          current,
          workspaceId,
          chatSpace ?? "work",
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
    if (chatWasOpen) {
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
      threadId: chatWasOpen ? tid : null,
      projectId: null,
      panelMode: chatWasOpen ? "split" : "collapsed",
      panelIntent: chatWasOpen ? "execute" : "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [spaceId, threadId, drafting, thread, workspaceId, pushTarget]);

  const deleteProjectCompletely = useCallback(
    async (targetProjectId: string) => {
      const pid = targetProjectId.trim();
      if (!pid) return;
      const ctx = { workspaceId, actorId: actor.id };
      const linkedChatId = projectChatId(workspaceId, pid);

      localSpaceEntityStore.deleteProject(ctx, pid);
      notifyEntityStoreChange();
      setThreads((current) =>
        current.filter(
          (item) => item.projectId !== pid && item.id !== linkedChatId,
        ),
      );
      if (projectId === pid) {
        backToSpaceHome();
      }

      const api = createApiBundle(getDataBackend());
      await api.entities.deleteProject(ctx, pid);
    },
    [workspaceId, actor.id, projectId, backToSpaceHome],
  );

  const openThread = useCallback(
    (id: string) => {
      const found = threads.find((item) => item.id === id);
      if (!found) return;
      if (found.workspaceId !== workspaceId) {
        persistWorkspace(found.workspaceId);
      }
      setThreadId(found.id);
      setDrafting(false);
      setConnectorId(null);
      setJobId(null);
      setSkillId(null);
      setView("chat");
      setMobileSurface("chat");

      const attached = isSpaceAttachedChat(found, found.workspaceId);
      if (found.projectId || attached) {
        const lens = found.spaceId ?? null;
        setSpaceId(lens);
        setProjectId(found.projectId ?? null);
        setPanelIntent("execute");
        setPanelMode("split");
        if (lens === "build") setBuildTool("preview");
        if (lens === "research") setResearchTool("overview");
        pushTarget({
          view: "chat",
          spaceId: lens,
          threadId: found.id,
          projectId: found.projectId ?? null,
          panelMode: "split",
          panelIntent: "execute",
          connectorId: null,
          jobId: null,
          skillId: null,
        });
        return;
      }

      // Detached New Chat: never associate with Work / open the space panel.
      setSpaceId(null);
      setProjectId(null);
      setPanelIntent("browse");
      setPanelMode("collapsed");
      pushTarget({
        view: "chat",
        spaceId: null,
        threadId: found.id,
        projectId: null,
        panelMode: "collapsed",
        panelIntent: "browse",
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
            (target.tab as SettingsTab | undefined) ?? "general",
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
            detail: "Pick a space (Build or Home) before creating a project.",
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
            detail: `Created “${project.title}” in ${
              space === "research"
                ? "Explore"
                : space === "studio"
                  ? "Create"
                  : space === "build"
                    ? "Create"
                    : "Work"
            }.`,
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
      webSearch: async (query, opts) => {
        const { searchWeb } = await import("@/lib/api/web-search-client");
        const result = await searchWeb(query, { workspaceId, ...opts });
        return result;
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
          citations: page.citations,
        };
      },
      webResearch: async ({ query, level }) => {
        const { researchWeb } = await import("@/lib/api/web-search-client");
        return researchWeb(query, { level, workspaceId });
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
    const pinned = readStandaloneBrowserPinned(actor.id, workspaceId);
    setView("chat");
    setDrafting(false);
    setPanelIntent("browse");
    setStandaloneBrowserOpen(pinned);
    setPanelMode(pinned ? "split" : "collapsed");
    setMobileSurface(pinned ? "panel" : "chat");
    pushTarget({
      view: "chat",
      spaceId: null,
      threadId: null,
      projectId: null,
      panelMode: pinned ? "split" : "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
      standaloneBrowserOpen: pinned || undefined,
    });
  }, [hist.i, goBack, pushTarget, actor.id, workspaceId]);

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

    if (
      view === "space" &&
      spaceId &&
      isDockChatSpace(spaceId) &&
      !threadId
    ) {
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

  const openStandaloneBrowser = useCallback(
    (opts?: { query?: string }) => {
      if (isStandaloneBrowserEphemeral()) {
        endQuickSearchBrowserSession(standaloneBrowserKey(actor.id, workspaceId));
        setStandaloneBrowserEphemeral(false);
      }
      const key = standaloneBrowserKey(actor.id, workspaceId);
      primeStandaloneBrowserSession(key, opts?.query ?? browserSearch);
      setBrowserSearch(null);
      writeStandaloneBrowserPinned(actor.id, workspaceId, true);
      setStandaloneBrowserOpen(true);
      setPanelMode("split");
      setPanelRatioState((ratio) =>
        ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : Math.max(ratio, DEFAULT_PANEL_RATIO),
      );
      setMobileSurface("panel");
      pushTarget({
        view,
        spaceId,
        threadId,
        projectId,
        panelMode: "split",
        panelIntent,
        connectorId,
        jobId,
        skillId,
        standaloneBrowserOpen: true,
      });
    },
    [
      actor.id,
      workspaceId,
      browserSearch,
      view,
      spaceId,
      threadId,
      projectId,
      panelIntent,
      connectorId,
      jobId,
      skillId,
      pushTarget,
    ],
  );

  const openQuickSearchBrowser = useCallback(() => {
    const key = standaloneBrowserKey(actor.id, workspaceId);
    beginQuickSearchBrowserSession(key);
    setBrowserSearch(null);
    setStandaloneBrowserEphemeral(true);
    setStandaloneBrowserOpen(true);
    setView("space");
    setSpaceId("research");
    setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setPanelMode("split");
    setPanelRatioState((ratio) =>
      ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
    );
    setMobileSurface("panel");
    pushTarget({
      view: "space",
      spaceId: "research",
      threadId,
      projectId: null,
      panelMode: "split",
      panelIntent,
      connectorId: null,
      jobId: null,
      skillId: null,
      standaloneBrowserOpen: true,
    });
  }, [
    actor.id,
    workspaceId,
    threadId,
    panelIntent,
    pushTarget,
  ]);

  const closeStandaloneBrowser = useCallback(() => {
    const key = standaloneBrowserKey(actor.id, workspaceId);
    const ephemeral = isStandaloneBrowserEphemeral();
    if (ephemeral) {
      endQuickSearchBrowserSession(key);
      setStandaloneBrowserEphemeral(false);
    } else {
      writeStandaloneBrowserPinned(actor.id, workspaceId, false);
    }
    setStandaloneBrowserOpen(false);
    const chatActive = Boolean(threadId) || drafting;
    const nextPanelMode =
      ephemeral && chatActive && spaceId === "research" ? "split" : "collapsed";
    setPanelMode(nextPanelMode);
    setMobileSurface(ephemeral && chatActive ? "panel" : "chat");
    pushTarget({
      view,
      spaceId,
      threadId,
      projectId,
      panelMode: nextPanelMode,
      panelIntent,
      connectorId,
      jobId,
      skillId,
      standaloneBrowserOpen: false,
    });
  }, [
    actor.id,
    workspaceId,
    view,
    spaceId,
    threadId,
    drafting,
    projectId,
    panelIntent,
    connectorId,
    jobId,
    skillId,
    pushTarget,
  ]);

  const toggleStandaloneBrowser = useCallback(() => {
    if (standaloneBrowserOpen && panelMode !== "collapsed") {
      closeStandaloneBrowser();
      return;
    }
    openStandaloneBrowser();
  }, [
    standaloneBrowserOpen,
    panelMode,
    closeStandaloneBrowser,
    openStandaloneBrowser,
  ]);

  const openBrowser = useCallback(
    (opts?: { chat?: boolean; query?: string }) => {
      if (opts?.query) setBrowserSearch(opts.query.trim());
      openStandaloneBrowser({ query: opts?.query });
    },
    [openStandaloneBrowser],
  );

  const openInAppBrowser = useCallback(
    (url: string, opts?: { title?: string }) => {
      if (!isSafeInAppBrowserUrl(url)) return;
      const title = opts?.title?.trim() || undefined;

      if (projectId && isChatSpace(spaceId)) {
        openUrlInProjectBrowser({
          profileId: actor.id,
          workspaceId,
          spaceId,
          projectId,
          projectTitle: project?.name ?? "Project",
          url,
          title,
        });
        setPanelMode("split");
        setPanelRatioState((ratio) =>
          ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
        );
        setMobileSurface("panel");
        return;
      }

      if (view === "space" && isChatSpace(spaceId) && !projectId) {
        const key = standaloneBrowserKey(actor.id, workspaceId);
        beginQuickSearchBrowserSession(key);
        setStandaloneBrowserEphemeral(true);
        setStandaloneBrowserOpen(true);
        openUrlInStandaloneBrowser({
          profileId: actor.id,
          workspaceId,
          url,
          title,
        });
        setPanelMode("split");
        setPanelRatioState((ratio) =>
          ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
        );
        setMobileSurface("panel");
        return;
      }

      openStandaloneBrowser();
      openUrlInStandaloneBrowser({
        profileId: actor.id,
        workspaceId,
        url,
        title,
      });
    },
    [
      actor.id,
      workspaceId,
      projectId,
      spaceId,
      project?.name,
      view,
      openStandaloneBrowser,
    ],
  );

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
      if (target === "research") setResearchTool("overview");
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
        setResearchTool("overview");
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
          title: ref.label ?? "From Home",
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
    const catalog = CONNECTOR_CATALOG.find((item) => item.id === id);
    const title = catalog?.name ? `${catalog.name}` : "Connector";
    const snapshot = getChatStoreSnapshot().threads;
    const { threads: next, id: nextId } = upsertPersistentConnectorThread(
      snapshot,
      workspaceId,
      id,
      title,
    );
    const connectorThread = next.find((item) => item.id === nextId);
    const hasMessages = threadHasTurns(connectorThread);

    flushSync(() => {
      threadIdRef.current = nextId;
      setThreadId(nextId);
    });
    setThreads(() => next);
    setView("chat");
    setSpaceId("connectors");
    setConnectorId(id);
    setProjectId(null);
    setJobId(null);
    setSkillId(null);
    setDrafting(!hasMessages);
    setPanelIntent("execute");
    setPanelMode("split");
    // Choice-panel compact ratio must not stick after leaving New Chat.
    setPanelRatioState((ratio) =>
      ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
    );
    setMobileSurface("panel");
    pushTarget({
      view: "chat",
      spaceId: "connectors",
      threadId: nextId,
      projectId: null,
      panelMode: "split",
      panelIntent: "execute",
      connectorId: id,
      jobId: null,
      skillId: null,
    });
  }, [pushTarget, workspaceId, setThreads]);

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
    setPanelRatioState((ratio) =>
      ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
    );
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
    setPanelRatioState((ratio) =>
      ratio < PANEL_RATIO_OPEN_FLOOR ? PANEL_RATIO_OPEN_FLOOR : ratio,
    );
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
      mobileContentSurface,
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
      startDraftProject,
      setDraftAsDefaultChat,
      collapseDraft,
      closeSpaceChat,
      clearSessionSummary,
      updateSessionSummary,
      clearPersistentChat,
      deleteChat,
      deleteProjectCompletely,
      sendMessage,
      continueAfterClarification,
      openSpace,
      openRecents,
      openBrowser,
      openInAppBrowser,
      standaloneBrowserOpen,
      standaloneBrowserEphemeral,
      openStandaloneBrowser,
      openQuickSearchBrowser,
      closeStandaloneBrowser,
      toggleStandaloneBrowser,
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
      cancelImageGeneration,
      retryImageGeneration,
      turnActive,
      stopTurn,
      reorderPins,
      moveSidebarNav: moveNavItem,
      openProject,
      openWorkItem,
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
      mobileContentSurface,
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
      startDraftProject,
      setDraftAsDefaultChat,
      collapseDraft,
      closeSpaceChat,
      clearSessionSummary,
      updateSessionSummary,
      clearPersistentChat,
      deleteChat,
      deleteProjectCompletely,
      sendMessage,
      continueAfterClarification,
      openSpace,
      openRecents,
      openBrowser,
      openInAppBrowser,
      standaloneBrowserOpen,
      standaloneBrowserEphemeral,
      openStandaloneBrowser,
      openQuickSearchBrowser,
      closeStandaloneBrowser,
      toggleStandaloneBrowser,
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
      cancelImageGeneration,
      retryImageGeneration,
      turnActive,
      stopTurn,
      reorderPins,
      moveNavItem,
      openProject,
      openWorkItem,
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

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
