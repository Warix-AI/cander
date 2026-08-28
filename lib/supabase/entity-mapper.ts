import type {
  BriefingItem,
  Deployment,
  SpaceAttachment,
  SpaceProject,
  SpaceSource,
} from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

export type ProjectRow = {
  id: string;
  workspace_id: string;
  space_id: string;
  title: string;
  summary: string;
  cover: string | null;
  kind: SpaceProject["kind"];
  status: SpaceProject["status"];
  instructions: string | null;
  thread_id: string | null;
  published_url: string | null;
  domains: string[];
  version: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
};

export type SourceRow = {
  id: string;
  workspace_id: string;
  space_id: string;
  project_id: string | null;
  title: string;
  kind: SpaceSource["kind"];
  url: string | null;
  file_id: string | null;
  folder_id: string | null;
  citation_meta: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
};

export type BriefingRow = {
  id: string;
  workspace_id: string;
  connector_id: string | null;
  tone: BriefingItem["tone"];
  title: string;
  summary: string;
  action_type: string | null;
  external_id: string | null;
  snoozed_until: string | null;
  prompt: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type DeploymentRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  url: string;
  status: Deployment["status"];
  version: number;
  created_at: string;
  updated_at: string;
};

export type AttachmentRow = {
  id: string;
  workspace_id: string;
  kind: SpaceAttachment["kind"];
  target_id: string;
  label: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type EntityLinkRow = {
  id: string;
  workspace_id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  created_at: string;
};

export function projectRowToEntity(row: ProjectRow): SpaceProject {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    space: row.space_id as SpaceId,
    title: row.title,
    summary: row.summary,
    cover: row.cover ?? undefined,
    kind: row.kind,
    status: row.status,
    instructions: row.instructions ?? undefined,
    threadId: row.thread_id ?? undefined,
    publishedUrl: row.published_url ?? undefined,
    domains: row.domains.length ? row.domains : undefined,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
  };
}

export function projectToRow(
  project: SpaceProject,
  createdBy?: string | null,
): ProjectRow {
  return {
    id: project.id,
    workspace_id: project.workspaceId,
    space_id: project.space,
    title: project.title,
    summary: project.summary,
    cover: project.cover ?? null,
    kind: project.kind,
    status: project.status,
    instructions: project.instructions ?? null,
    thread_id: project.threadId ?? null,
    published_url: project.publishedUrl ?? null,
    domains: project.domains ?? [],
    version: project.version,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    created_by: project.createdBy ?? createdBy ?? null,
  };
}

export function sourceRowToEntity(row: SourceRow): SpaceSource {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    space: row.space_id as SpaceId,
    projectId: row.project_id ?? undefined,
    title: row.title,
    kind: row.kind,
    url: row.url ?? undefined,
    fileId: row.file_id ?? undefined,
    folderId: row.folder_id,
    citationMeta: row.citation_meta ?? undefined,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
  };
}

export function sourceToRow(
  source: SpaceSource,
  createdBy?: string | null,
): SourceRow {
  return {
    id: source.id,
    workspace_id: source.workspaceId,
    space_id: source.space,
    project_id: source.projectId ?? null,
    title: source.title,
    kind: source.kind,
    url: source.url ?? null,
    file_id: source.fileId ?? null,
    folder_id: source.folderId ?? null,
    citation_meta: source.citationMeta ?? null,
    version: source.version,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
    created_by: source.createdBy ?? createdBy ?? null,
  };
}

export function briefingRowToEntity(row: BriefingRow): BriefingItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    connectorId: row.connector_id ?? undefined,
    tone: row.tone,
    title: row.title,
    summary: row.summary,
    actionType: row.action_type ?? undefined,
    externalId: row.external_id ?? undefined,
    snoozedUntil: row.snoozed_until,
    prompt: row.prompt ?? undefined,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function briefingToRow(item: BriefingItem): BriefingRow {
  return {
    id: item.id,
    workspace_id: item.workspaceId,
    connector_id: item.connectorId ?? null,
    tone: item.tone,
    title: item.title,
    summary: item.summary,
    action_type: item.actionType ?? null,
    external_id: item.externalId ?? null,
    snoozed_until: item.snoozedUntil ?? null,
    prompt: item.prompt ?? null,
    version: item.version,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export function deploymentRowToEntity(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    url: row.url,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deploymentToRow(deployment: Deployment): DeploymentRow {
  return {
    id: deployment.id,
    workspace_id: deployment.workspaceId,
    project_id: deployment.projectId,
    url: deployment.url,
    status: deployment.status,
    version: deployment.version,
    created_at: deployment.createdAt,
    updated_at: deployment.updatedAt,
  };
}

export function attachmentRowToEntity(row: AttachmentRow): SpaceAttachment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    targetId: row.target_id,
    label: row.label ?? undefined,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function attachmentToRow(attachment: SpaceAttachment): AttachmentRow {
  return {
    id: attachment.id,
    workspace_id: attachment.workspaceId,
    kind: attachment.kind,
    target_id: attachment.targetId,
    label: attachment.label ?? null,
    version: attachment.version,
    created_at: attachment.createdAt,
    updated_at: attachment.updatedAt,
  };
}
