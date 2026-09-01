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
export type BillingPlan = "free" | "pro" | "max";
export type Theme = "light" | "dark";
export type SpaceId = "work" | "build" | "research";

/** Sidebar destinations that are not product spaces (e.g. Connectors). */
export type NavDestinationId = SpaceId | "connectors";

export type CourierView =
  | "chat"
  | "space"
  | "settings"
  | "shared"
  | "recents"
  | "browser";

export type PinKind = "thread" | "project" | "connector";

export type PinTier = "primary" | "secondary";

export type Pin = {
  kind: PinKind;
  id: string;
  /** Defaults to primary when missing (legacy pins). */
  tier?: PinTier;
};

export type OverlayId =
  | "workspace"
  | "publish"
  | "domains"
  | "search"
  | "configure"
  | "space-settings"
  | "invite-wall"
  | null;
export type SpaceLayout = "cards" | "list";
export type PanelMode = "collapsed" | "split" | "wide" | "immersive";
export type PanelIntent = "browse" | "execute";
/** Mobile exclusive surface: menu · chat · right panel (swipeable). */
export type MobileSurface = "menu" | "chat" | "panel";

/** Nested screens inside the mobile menu pane. */
export type MobileMenuScreen = "main" | "pinned" | "workspace";

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
  | "appearance"
  | "hosting";

export type Role = "Owner" | "Admin" | "Member";
export type SeatStatus = "active" | "pending";

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";
export type MemberKind = "org" | "personal";
/** Tenancy flavor — same UI, different permissions and invite rules. */
export type WorkspaceKind = "personal" | "business";

export type AccountPresetId =
  | "max-owner"
  | "max-admin"
  | "max-member"
  | "pro"
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

export type PlatformDeployment = {
  name: string;
  status: "Active" | "Standby" | "Ready";
  hint: string;
  hosting: HostingMode;
};

export type MessageStatus = "complete" | "pending" | "streaming" | "error";

/** Live activity while a reply is pending — one phase, one timer. */
export type MessageActivity = {
  /** Calm user-facing phase (Generating / Searching / …). */
  phase?:
    | "generating"
    | "searching"
    | "reading"
    | "checking"
    | "building"
    | "updating";
  /** Wall-clock start of this turn — elapsed time must not reset on phase change. */
  startedAt?: number;
  /**
   * @deprecated Prefer `phase`. Kept for older persisted messages.
   * Primary shimmer line when `phase` is absent.
   */
  label?: string;
  /**
   * @deprecated Never show a second stacked status line.
   */
  detail?: string;
  kind?: "idle" | "tool" | "work";
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  at: string;
  blocks?: ChatBlock[];
  /** Normalized web sources for grounded answers (survives reload). */
  citations?: Array<{
    id: string;
    title: string;
    url: string;
    canonicalUrl?: string;
    domain?: string;
    excerpt?: string;
    publishedAt?: string;
    retrievedAt?: string;
    sourceType?: string;
  }>;
  /** In-flight / stream status for live AI turns. */
  status?: MessageStatus;
  /** Cursor-style activity while pending (thinking / tool). */
  activity?: MessageActivity | null;
  /** Subtle transcript event (not an assistant reply). */
  event?: "condensed";
  /** In-stream divider when the continuous chat switches spaces. */
  spaceSwitch?: { from: SpaceId; to: SpaceId };
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
  | { type: "deploy"; url: string; status: "ready" | "live" }
  /** In-app agent tool activity. */
  | {
      type: "tool";
      label: string;
      status: "running" | "done" | "error";
      detail?: string;
    }
  | {
      type: "clarification";
      title: string;
      answers: Record<string, unknown>;
      skipped?: boolean;
    }
  | {
      type: "image";
      url: string;
      name: string;
      mime?: string;
      /** Persisted chat_attachments row for follow-up edits */
      attachmentId?: string;
      openaiFileId?: string;
    }
  | {
      /** Async GPT Image job — placeholder until completed. */
      type: "image_generation";
      status: "generating" | "completed" | "failed" | "cancelled";
      generationId: string;
      prompt: string;
      imageUrl: string | null;
      mime?: string;
      name?: string;
      error?: string;
      attachmentId?: string;
      openaiFileId?: string;
    }
  | {
      type: "file";
      name: string;
      /** Extracted text for model continuity — not shown in the bubble. */
      text?: string;
    };

export type ChatImageAttachment = {
  url: string;
  name: string;
  mime: string;
};

export type ChatFileAttachment = {
  name: string;
  /** Extracted text for the model only — not shown in the bubble. */
  text?: string;
  /** Raw bytes for OpenAI Files upload (raw mode). */
  blob?: Blob;
  mimeType?: string;
  size?: number;
};

/** Unified send-path attachment (no device-local file:// URIs). */
export type ChatSendAttachment = {
  id: string;
  type: "image" | "file";
  filename: string;
  mimeType: string;
  size: number;
  /** Image bytes as data URL — never capacitor:// or file:// */
  dataUrl?: string;
  /** Raw file bytes for OpenAI Files upload */
  blob?: Blob;
  /** Extracted file text for the model (legacy / non-raw fallback) */
  text?: string;
  /** Server chat_attachments.id after upload */
  openaiAttachmentId?: string;
};

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

/** A conversation. `spaceId` is the active UI lens — it may differ from the linked project's home space. */
export type Thread = {
  id: string;
  title: string;
  /** Tenancy boundary — objects do not cross workspaces. */
  workspaceId: string;
  /** Cross-space link back to a project, when this chat belongs to one. */
  projectId?: string;
  spaceId?: SpaceId;
  updatedAt: string;
  snippet: string;
  messages: Message[];
  shared?: boolean;
  /** Dock chat for a space — resumes instead of minting new. */
  persistent?: boolean;
  /** Short Cursor-style blurb written when the dock chat is closed. */
  sessionSummary?: string | null;
  /** Profile that started this thread — used for attribution in shared workspaces. */
  createdBy?: string;
  /** Owner-private AI chat row (Edge `ai-chat`) linked to this UI thread. */
  aiChatId?: string;
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

/** A durable unit of work. `space` is the dashboard/home bucket, not a storage partition. */
export type Project = {
  id: string;
  name: string;
  /** Where the project card lives in Home navigation. */
  space: SpaceId;
  /** Tenancy boundary — objects do not cross workspaces. */
  workspaceId: string;
  summary: string;
  updatedAt: string;
  domains?: string[];
  cover?: string;
  threadId?: string;
};

export type AssetKind = "image" | "document" | "code" | "media" | "data" | "folder";

/** A file or output. Link to a project via `projectId`; `source` records where it was created. */
export type AssetFile = {
  id: string;
  name: string;
  kind: AssetKind;
  ext: string;
  size: string;
  /** Space where the asset was produced — not a hard ownership boundary. */
  source: SpaceId;
  /** Cross-space link back to a project, when applicable. */
  projectId?: string;
  /** Tenancy boundary — objects do not cross workspaces. */
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
  /** Prefer `kind`. Kept for older persisted rows. */
  personal?: boolean;
  kind?: WorkspaceKind;
};

export type KnowledgeFile = {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  /** Extracted plain text for retrieval (text/md/etc.). */
  contentText?: string;
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
  /** Org member: company that manages this seat. */
  managedByOrgName?: string;
  /** Max owner skipped org setup during onboarding — show finish CTA. */
  orgSetupDeferred?: boolean;
  /** Linked Supabase organization id when known. */
  orgId?: string;
  /** Per-workspace membership role from workspace_members. */
  workspaceRoles?: Record<string, Role>;
  /** Stripe-backed access for personal payers; org members set active on accept. */
  subscriptionStatus?: SubscriptionStatus;
  /** When the current billing period ends (ISO timestamp). */
  subscriptionPeriodEnd?: string;
  /** Subscription set to cancel at period end — billing stops after subscriptionPeriodEnd. */
  cancelAtPeriodEnd?: boolean;
};
