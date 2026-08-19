export type ProductId = "courier" | "platform";
/** Where inference runs. Independent of BillingPlan and device class. */
export type HostingMode = "cloud" | "local" | "on-device";

/** What a model needs to run. Compare to hardware — never to a plan name. */
export type ModelRequirements = {
  memoryGb?: number;
};

/** What a machine can run. Detect later; do not infer from plan or phone vs desktop. */
export type HardwareCapabilities = {
  memoryGb?: number;
};
export type BillingPlan = "free" | "pro" | "max" | "ultra";
export type Theme = "light" | "dark";
export type SpaceId =
  | "work"
  | "build"
  | "studio"
  | "research"
  | "personal"
  | "files"
  | "skills"
  | "scheduled"
  | "connectors"
  | "finances"
  | "health";

export type CourierView =
  | "chat"
  | "space"
  | "settings"
  | "shared"
  | "recents"
  | "browser";

export type PinKind = "thread" | "project";

export type Pin = {
  kind: PinKind;
  id: string;
};

export type OverlayId =
  | "settings"
  | "workspace"
  | "publish"
  | "search"
  | "configure"
  | "space-settings"
  | "invite-wall"
  | null;
export type SpaceLayout = "cards" | "list";
export type PanelMode = "collapsed" | "split" | "wide" | "immersive";
export type PanelIntent = "browse" | "execute";

export type PageReference = {
  url: string;
  title: string;
};

export type BuildTool =
  | "overview"
  | "chats"
  | "files"
  | "editor"
  | "preview"
  | "more"
  | "terminal"
  | "git"
  | "deployments"
  | "database"
  | "logs"
  | "env"
  | "activity"
  | "design"
  | "dependencies";

export type StudioTool =
  | "overview"
  | "generate"
  | "canvas"
  | "retouch"
  | "video"
  | "timeline"
  | "library"
  | "layers"
  | "export";

export type ResearchTool =
  | "overview"
  | "browser"
  | "sources"
  | "notes"
  | "report";

export type SkillsTool = "overview" | "editor" | "tests" | "versions";

export type ScheduledStatus =
  | "upcoming"
  | "active"
  | "paused"
  | "completed"
  | "failed";

export type SettingsTab =
  | "organization"
  | "workspaces"
  | "plans"
  | "general"
  | "appearance";

export type PlatformNav =
  | "overview"
  | "hosting"
  | "models"
  | "api"
  | "keys"
  | "deployments"
  | "logs"
  | "usage"
  | "docs"
  | "recents";

export type Role = "Owner" | "Admin" | "Member";
export type SeatStatus = "active" | "pending";
export type MemberKind = "org" | "personal";
export type UltraScope = "org" | "personal";

export type UltraLicense = {
  id: string;
  userId: string | null;
  scope: UltraScope;
};

export type AccountPresetId =
  | "max-owner"
  | "max-admin"
  | "max-member"
  | "ultra-member"
  | "pro"
  | "ultra"
  | "free";

export type WorkspaceResource = {
  id: string;
  workspaceId: string;
  kind: "model" | "deployment" | "api";
  name: string;
  createdBy: string;
  ownerId: string;
  hosting: HostingMode;
  environment: "test" | "production";
  /** Members who may consume this resource. They do not need Ultra to use it. */
  authorizedMemberIds: string[];
  status: "active" | "paused";
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  blocks?: ChatBlock[];
};

export type BuildStepStatus = "done" | "active" | "pending";

export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "plan"; title: string; steps: string[]; details?: string }
  | {
      type: "build";
      title: string;
      items: { id: string; label: string; status: BuildStepStatus }[];
      details?: string;
      complete?: boolean;
    }
  | { type: "suggestions"; prompt: string; actions: { id: string; label: string }[] }
  | { type: "secret"; service: string; keyName: string; filled?: boolean }
  | { type: "connect"; service: string; status: "pending" | "connected" }
  | { type: "error"; title: string; body: string; details?: string }
  | { type: "deploy"; url: string; status: "ready" | "live" };

export type Checkpoint = {
  id: string;
  title: string;
  at: string;
  day: string;
  summary: string;
  files: string[];
  diff?: string;
};

export type ViewportId = "desktop" | "tablet" | "mobile";

export type PreviewNodeId = "nav" | "kicker" | "heading" | "body" | "cta";

export type ProjectMemory = {
  purpose: string;
  stack: string;
  integrations: string[];
  features: string[];
  rejected: string[];
};

export type Thread = {
  id: string;
  title: string;
  workspaceId: string;
  product?: ProductId;
  projectId?: string;
  spaceId?: SpaceId;
  platformNav?: PlatformNav;
  updatedAt: string;
  snippet: string;
  messages: Message[];
  shared?: boolean;
};

export type VoiceAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type Project = {
  id: string;
  name: string;
  space: SpaceId;
  workspaceId: string;
  summary: string;
  updatedAt: string;
  domains?: string[];
  cover?: string;
  threadId?: string;
};

export type AssetKind = "image" | "document" | "code" | "media" | "data" | "folder";

export type AssetFile = {
  id: string;
  name: string;
  kind: AssetKind;
  ext: string;
  size: string;
  source: SpaceId;
  projectId?: string;
  workspaceId: string;
  updatedAt: string;
  cover?: string;
};

export type Workspace = {
  id: string;
  name: string;
  spaces: SpaceId[];
  members: number;
  budget: string;
  spend: string;
  personal?: boolean;
};

export type KnowledgeFile = {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  summary: string;
  sources: number;
  updatedAt: string;
  files: KnowledgeFile[];
};

export type WorkspaceMemberPolicy = {
  memberId: string;
  spaces: SpaceId[];
};

export type WorkspacePolicy = {
  knowledgeBases: KnowledgeBase[];
  members: WorkspaceMemberPolicy[];
  disabledConnectors: string[];
};

export type ScheduledJob = {
  id: string;
  name: string;
  workspaceId: string;
  space: SpaceId;
  projectId?: string;
  threadId?: string;
  snippet: string;
  schedule: string;
  nextRun: string;
  lastRun: string;
  status: ScheduledStatus;
  owner: string;
};

export type ConnectorAccount = {
  id: string;
  label: string;
  status: "connected" | "needs-reauth" | "error";
};

export type ConnectorScope = "public" | "personal";

export type Connector = {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  installed: boolean;
  featured?: boolean;
  scope: ConnectorScope;
  accounts: ConnectorAccount[];
  actions: string[];
};

export type Skill = {
  id: string;
  name: string;
  summary: string;
  when: string;
  workspaceId: string;
  source: "custom" | "ai";
  updatedAt: string;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  short: string;
  initials: string;
  role: Role;
  workspaceIds: string[];
  plan: BillingPlan;
  seatStatus: SeatStatus;
  kind: MemberKind;
};
