export type ProductId = "courier" | "platform";
export type HostingMode = "cloud" | "local" | "on-device";
export type BillingPlan = "personal" | "business";
export type Theme = "light" | "dark";
export type SpaceId =
  | "build"
  | "studio"
  | "research"
  | "skills"
  | "scheduled"
  | "connectors";

export type CourierView = "chat" | "space" | "settings" | "shared" | "recents";
export type OverlayId = "settings" | "workspace" | null;
export type SpaceLayout = "cards" | "list";
export type PanelMode = "collapsed" | "split" | "wide" | "immersive";
export type PanelIntent = "browse" | "execute";

export type BuildTool =
  | "overview"
  | "chats"
  | "files"
  | "editor"
  | "preview"
  | "terminal"
  | "git"
  | "deployments"
  | "database"
  | "logs"
  | "env"
  | "activity"
  | "design";

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
  | "account"
  | "users"
  | "workspaces"
  | "organization"
  | "access"
  | "billing"
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
  | "docs";

export type Role = "Owner" | "Admin" | "Member";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
};

export type Thread = {
  id: string;
  title: string;
  workspaceId: string;
  projectId?: string;
  spaceId?: SpaceId;
  updatedAt: string;
  snippet: string;
  messages: Message[];
  shared?: boolean;
};

export type Project = {
  id: string;
  name: string;
  space: SpaceId;
  workspaceId: string;
  summary: string;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  spaces: SpaceId[];
  members: number;
  budget: string;
  spend: string;
};

export type KnowledgeAccess = "manage" | "use" | "none";
export type WorkspaceSeatRole = "admin" | "member" | "viewer";

export type KnowledgeBase = {
  id: string;
  name: string;
  summary: string;
  sources: number;
  updatedAt: string;
};

export type WorkspaceMemberPolicy = {
  memberId: string;
  role: WorkspaceSeatRole;
  knowledge: KnowledgeAccess;
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

export type Connector = {
  id: string;
  name: string;
  category: string;
  icon: string;
  installed: boolean;
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
  role: Role;
  workspaceIds: string[];
};
