"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { projects, starterThreads, workspaces } from "@/lib/data";
import { inferIntent, nextId } from "@/lib/intent";
import {
  getApiServerSnapshot,
  getApiSnapshot,
  getHostingServerSnapshot,
  getHostingSnapshot,
  getPlanServerSnapshot,
  getPlanSnapshot,
  getProductServerSnapshot,
  getProductSnapshot,
  getWorkspaceServerSnapshot,
  getWorkspaceSnapshot,
  persistApi,
  persistHosting,
  persistPlan,
  persistProduct,
  persistWorkspace,
  subscribeApi,
  subscribeHosting,
  subscribePlan,
  subscribeProduct,
  subscribeWorkspace,
} from "@/lib/session";
import {
  getPoliciesServerSnapshot,
  getPoliciesSnapshot,
  subscribePolicies,
} from "@/lib/workspace-policy";
import { isChatSpace } from "@/lib/spaces";
import type {
  BuildTool,
  CourierView,
  BillingPlan,
  HostingMode,
  OverlayId,
  PanelIntent,
  PanelMode,
  PlatformNav,
  ProductId,
  Project,
  ResearchTool,
  SettingsTab,
  SkillsTool,
  SpaceId,
  SpaceLayout,
  StudioTool,
  Thread,
  WorkspacePolicy,
} from "@/lib/types";

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
  billingPlan: BillingPlan;
  setBillingPlan: (plan: BillingPlan) => void;
  apiEnabled: boolean;
  setApiEnabled: (on: boolean) => void;
  workspacePolicies: Record<string, WorkspacePolicy>;
  workspaceId: string;
  setWorkspace: (id: string) => void;
  workspace: (typeof workspaces)[number];
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
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
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
  connectorId: string | null;
  jobId: string | null;
  scheduledFilter: string;
  setScheduledFilter: (id: string) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  spaceLayout: SpaceLayout;
  setSpaceLayout: (layout: SpaceLayout) => void;
  overlay: OverlayId;
  openOverlay: (id: OverlayId) => void;
  closeOverlay: () => void;
  platformNav: PlatformNav;
  setPlatformNav: (id: PlatformNav) => void;
  newChat: (space?: SpaceId) => void;
  setChatSpace: (id: SpaceId | null) => void;
  armChatInterface: (id: SpaceId) => void;
  collapseDraft: () => void;
  sendMessage: (text: string, opts?: SendOpts) => void;
  openSpace: (id: SpaceId) => void;
  openRecents: () => void;
  openProject: (id: string) => void;
  openThread: (id: string) => void;
  openShared: () => void;
  openSettings: () => void;
  openConnector: (id: string) => void;
  openJob: (id: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
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
  const billingPlan = useSyncExternalStore(
    subscribePlan,
    getPlanSnapshot,
    getPlanServerSnapshot,
  );
  const apiEnabled = useSyncExternalStore(
    subscribeApi,
    getApiSnapshot,
    getApiServerSnapshot,
  );
  const workspacePolicies = useSyncExternalStore(
    subscribePolicies,
    getPoliciesSnapshot,
    getPoliciesServerSnapshot,
  );
  const workspaceId = useSyncExternalStore(
    subscribeWorkspace,
    getWorkspaceSnapshot,
    getWorkspaceServerSnapshot,
  );

  const [view, setView] = useState<CourierView>("chat");
  const [threads, setThreads] = useState<Thread[]>(starterThreads);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<SpaceId | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("collapsed");
  const [panelIntent, setPanelIntent] = useState<PanelIntent>("browse");
  const [panelRatio, setPanelRatio] = useState(0.46);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [buildTool, setBuildTool] = useState<BuildTool>("preview");
  const [studioTool, setStudioTool] = useState<StudioTool>("canvas");
  const [researchTool, setResearchTool] = useState<ResearchTool>("browser");
  const [skillsTool, setSkillsTool] = useState<SkillsTool>("editor");
  const [skillId, setSkillId] = useState<string | null>(null);
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [scheduledFilter, setScheduledFilter] = useState("upcoming");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [platformNav, setPlatformNavState] = useState<PlatformNav>("overview");
  const [spaceLayout, setSpaceLayout] = useState<SpaceLayout>("cards");
  const [overlay, setOverlay] = useState<OverlayId>(null);
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

  const workspace =
    workspaces.find((item) => item.id === workspaceId) ?? workspaces[0];
  const project = projects.find((item) => item.id === projectId);
  const thread = threads.find((item) => item.id === threadId) ?? null;

  const setProduct = useCallback((id: ProductId) => {
    persistProduct(id);
    setMobileNav(false);
    setOverlay(null);
    pushTarget({
      product: id,
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
  ]);

  const setHostingMode = useCallback((id: HostingMode) => {
    persistHosting(id);
  }, []);

  const setBillingPlan = useCallback((plan: BillingPlan) => {
    persistPlan(plan);
  }, []);

  const setApiEnabled = useCallback((on: boolean) => {
    persistApi(on);
  }, []);

  const setPlatformNav = useCallback(
    (id: PlatformNav) => {
      setPlatformNavState(id);
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
    ],
  );

  const setWorkspace = useCallback((id: string) => {
    persistWorkspace(id);
    setProjectId(null);
    setSpaceId(null);
    setThreadId(null);
    setView("chat");
    setPanelMode("collapsed");
    setDrafting(false);
    setMobileNav(false);
    setOverlay(null);
  }, []);

  const newChat = useCallback((space?: SpaceId) => {
    setView("chat");
    setThreadId(null);
    setSpaceId(space ?? null);
    if (!space) setProjectId(null);
    setConnectorId(null);
    setJobId(null);
    setSkillId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "chat",
      spaceId: space ?? null,
      threadId: null,
      projectId: space ? projectId : null,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: null,
      skillId: null,
    });
  }, [product, projectId, platformNav, pushTarget]);

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

  const armChatInterface = useCallback((id: SpaceId) => {
    if (!isChatSpace(id)) return;
    setDrafting(true);
    setView("chat");
    setSpaceId(id);
    setPanelIntent("execute");
    setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
    if (id === "build") setBuildTool("preview");
    if (id === "studio") setStudioTool("canvas");
    if (id === "research") setResearchTool("browser");
    if (id === "skills") setSkillsTool("editor");
  }, []);

  const collapseDraft = useCallback(() => {
    setDrafting(false);
    setPanelMode((mode) => (threadId ? mode : "collapsed"));
    if (!threadId) setPanelIntent("browse");
  }, [threadId]);

  const sendMessage = useCallback(
    (text: string, opts?: SendOpts) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const intent = inferIntent(trimmed, workspaceId);
      const space = opts?.space ?? spaceId ?? intent.space;

      if (!isChatSpace(space)) {
        setView("space");
        setSpaceId(space);
        setThreadId(null);
        setDrafting(false);
        setConnectorId(intent.connectorId ?? null);
        setJobId(intent.jobId ?? null);
        setPanelMode("collapsed");
        pushTarget({
          product,
          view: "space",
          spaceId: space,
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

      const matched = intent.projectId
        ? projects.find((item) => item.id === intent.projectId)
        : undefined;
      if (matched && matched.workspaceId !== workspaceId) {
        persistWorkspace(matched.workspaceId);
      }

      const userMsg = {
        id: nextId("u"),
        role: "user" as const,
        content: trimmed,
        at: nowTime(),
      };
      const assistantMsg = {
        id: nextId("a"),
        role: "assistant" as const,
        content: intent.reply,
        at: nowTime(),
      };

      const activeId = threadId ?? nextId("t");
      if (!threadId) setThreadId(activeId);

      setThreads((current) => {
        const existing = current.find((item) => item.id === activeId);
        if (existing) {
          return current.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  title: item.messages.length ? item.title : trimmed.slice(0, 48),
                  snippet: trimmed,
                  updatedAt: "Just now",
                  spaceId: space,
                  projectId: intent.projectId ?? item.projectId,
                  workspaceId: matched?.workspaceId ?? item.workspaceId,
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
        };
        return [created, ...current];
      });

      setDrafting(false);
      setView("chat");
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
      setPanelMode((mode) => (mode === "collapsed" ? "split" : mode));
      pushTarget({
        product,
        view: "chat",
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
    [threadId, workspaceId, spaceId, product, platformNav, pushTarget],
  );

  const openSpace = useCallback((id: SpaceId) => {
    setView("space");
    setSpaceId(id);
    setProjectId(null);
    setThreadId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setConnectorId(null);
    setJobId(null);
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "space",
      spaceId: id,
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

  const openProject = useCallback((id: string) => {
    const match = projects.find((item) => item.id === id);
    if (!match) return;
    if (match.workspaceId !== workspaceId) persistWorkspace(match.workspaceId);
    setView("space");
    setProjectId(match.id);
    setSpaceId(match.space);
    setThreadId(null);
    setDrafting(false);
    setPanelIntent("browse");
    setBuildTool("overview");
    setStudioTool("overview");
    setResearchTool("overview");
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "space",
      spaceId: match.space,
      threadId: null,
      projectId: match.id,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
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
      setMobileNav(false);
      pushTarget({
        product,
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
    [threads, workspaceId, product, platformNav, pushTarget],
  );

  const openShared = useCallback(() => {
    setView("shared");
    setPanelMode("collapsed");
    setPanelIntent("browse");
    setSpaceId(null);
    setMobileNav(false);
  }, []);

  const openSettings = useCallback(() => {
    setOverlay("settings");
    setMobileNav(false);
  }, []);

  const openOverlay = useCallback((id: OverlayId) => {
    setOverlay(id);
    setMobileNav(false);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
  }, []);

  const openConnector = useCallback((id: string) => {
    setView("space");
    setSpaceId("connectors");
    setConnectorId(id);
    setThreadId(null);
    setDrafting(false);
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "space",
      spaceId: "connectors",
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: id,
      jobId: null,
      skillId: null,
    });
  }, [product, platformNav, pushTarget]);

  const openJob = useCallback((id: string) => {
    setView("space");
    setSpaceId("scheduled");
    setJobId(id);
    setThreadId(null);
    setDrafting(false);
    setPanelMode("collapsed");
    setMobileNav(false);
    pushTarget({
      product,
      view: "space",
      spaceId: "scheduled",
      threadId: null,
      projectId: null,
      platformNav,
      panelMode: "collapsed",
      panelIntent: "browse",
      connectorId: null,
      jobId: id,
      skillId: null,
    });
  }, [product, platformNav, pushTarget]);

  const value = useMemo(
    () => ({
      product,
      setProduct,
      hostingMode,
      setHostingMode,
      billingPlan,
      setBillingPlan,
      apiEnabled,
      setApiEnabled,
      workspacePolicies,
      workspaceId,
      setWorkspace,
      workspace,
      view,
      threads,
      threadId,
      thread,
      spaceId,
      projectId,
      project,
      panelMode,
      panelIntent,
      panelRatio,
      setPanelRatio,
      setPanelMode,
      sidebarOpen,
      setSidebarOpen,
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
      openOverlay,
      closeOverlay,
      newChat,
      setChatSpace,
      armChatInterface,
      collapseDraft,
      sendMessage,
      openSpace,
      openRecents,
      openProject,
      openThread,
      openShared,
      openSettings,
      openConnector,
      openJob,
      canGoBack: hist.i > 0,
      canGoForward: hist.i < hist.stack.length - 1,
      goBack,
      goForward,
    }),
    [
      product,
      setProduct,
      hostingMode,
      setHostingMode,
      billingPlan,
      setBillingPlan,
      apiEnabled,
      setApiEnabled,
      workspacePolicies,
      workspaceId,
      setWorkspace,
      workspace,
      view,
      threads,
      threadId,
      thread,
      spaceId,
      projectId,
      project,
      panelMode,
      panelIntent,
      panelRatio,
      sidebarOpen,
      mobileNav,
      dragging,
      drafting,
      buildTool,
      studioTool,
      researchTool,
      skillsTool,
      skillId,
      connectorId,
      jobId,
      scheduledFilter,
      settingsTab,
      platformNav,
      setPlatformNav,
      spaceLayout,
      overlay,
      openOverlay,
      closeOverlay,
      newChat,
      setChatSpace,
      armChatInterface,
      collapseDraft,
      sendMessage,
      openSpace,
      openRecents,
      openProject,
      openThread,
      openShared,
      openSettings,
      openConnector,
      openJob,
      hist,
      goBack,
      goForward,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
