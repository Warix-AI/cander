import type { Message, SpaceId, Thread } from "@/lib/types";

/** Every API call is scoped to a workspace + actor. */
export type WorkspaceCtx = {
  workspaceId: string;
  actorId: string;
};

export type EntityTimestamps = {
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type ProjectKind = "app" | "site" | "automation" | "research" | "general";
export type ProjectStatus = "draft" | "active" | "published" | "archived";

export type SpaceProject = EntityTimestamps & {
  id: string;
  space: SpaceId;
  workspaceId: string;
  title: string;
  summary: string;
  cover?: string;
  kind: ProjectKind;
  status: ProjectStatus;
  instructions?: string;
  threadId?: string;
  publishedUrl?: string;
  domains?: string[];
  /** Profile that created this project — attribution in shared workspaces. */
  createdBy?: string;
};

export type SourceKind = "web" | "pdf" | "note" | "report" | "file";

export type SpaceSource = EntityTimestamps & {
  id: string;
  space: SpaceId;
  workspaceId: string;
  projectId?: string;
  title: string;
  kind: SourceKind;
  url?: string;
  fileId?: string;
  folderId?: string | null;
  citationMeta?: Record<string, unknown>;
  /** Profile that created this source — attribution in shared workspaces. */
  createdBy?: string;
};

export type BriefingTone = "urgent" | "waiting" | "ready" | "neutral";
export type BriefingAction = "snooze" | "dismiss" | "mark_ready";

export type BriefingItem = EntityTimestamps & {
  id: string;
  workspaceId: string;
  connectorId?: string;
  tone: BriefingTone;
  title: string;
  summary: string;
  actionType?: string;
  externalId?: string;
  snoozedUntil?: string | null;
  prompt?: string;
};

export type AttachmentKind = "connector" | "buildApp" | "automation";

export type SpaceAttachment = EntityTimestamps & {
  id: string;
  workspaceId: string;
  kind: AttachmentKind;
  targetId: string;
  label?: string;
};

export type DeploymentStatus = "pending" | "live" | "failed";

export type Deployment = EntityTimestamps & {
  id: string;
  projectId: string;
  workspaceId: string;
  url: string;
  status: DeploymentStatus;
};

export type EntityRefType =
  | "project"
  | "source"
  | "briefing"
  | "page"
  | "attachment";

export type EntityRef = {
  type: EntityRefType;
  id: string;
  space: SpaceId;
  workspaceId: string;
  label?: string;
  snapshot?: string;
};

export type ProjectFilter = {
  kind?: ProjectKind;
  status?: ProjectStatus;
};

export type SourceFilter = {
  space?: SpaceId;
  projectId?: string;
  folderId?: string | null;
  kind?: SourceKind;
};

export type BriefingFilter = {
  tone?: BriefingTone;
  connectorId?: string;
  area?: "inbox" | "calendar" | "customers";
};

export type CreateProjectInput = {
  space: SpaceId;
  title: string;
  summary?: string;
  kind?: ProjectKind;
  cover?: string;
  instructions?: string;
};

export type UpdateProjectPatch = Partial<
  Pick<
    SpaceProject,
    | "title"
    | "summary"
    | "cover"
    | "kind"
    | "status"
    | "instructions"
    | "threadId"
    | "publishedUrl"
    | "domains"
  >
>;

export type CreateSourceInput = {
  space: SpaceId;
  title: string;
  kind: SourceKind;
  projectId?: string;
  url?: string;
  fileId?: string;
  folderId?: string | null;
  citationMeta?: Record<string, unknown>;
};

export type UpdateSourcePatch = Partial<
  Pick<
    SpaceSource,
    "title" | "kind" | "url" | "fileId" | "folderId" | "citationMeta" | "projectId"
  >
>;

export type CreateDeploymentInput = {
  url: string;
  status?: DeploymentStatus;
};

export type SendMessageInput = {
  content: string;
  refs?: EntityRef[];
};

export type CreateThreadInput = {
  spaceId: SpaceId;
  projectId?: string;
  title?: string;
};

export type ThreadFilter = {
  spaceId?: SpaceId;
  projectId?: string;
};

export type PreviewSession = {
  url: string;
  projectId: string;
};

export type ProjectFile = {
  path: string;
  label?: string;
};

export type PublishInput = {
  url?: string;
  slug?: string;
};

export type BrowserPage = {
  url: string;
  title: string;
};

export type ConnectorSession = {
  connectorId: string;
  panel: "gmail" | "handshake" | "generic";
};

/** Re-export thread/message for API layer convenience. */
export type { Message, Thread };

export function newEntityTimestamps(): EntityTimestamps {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now, version: 1 };
}

export function bumpVersion<T extends EntityTimestamps>(entity: T): T {
  return {
    ...entity,
    updatedAt: new Date().toISOString(),
    version: entity.version + 1,
  };
}

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
