import type {
  BriefingAction,
  BriefingFilter,
  BriefingItem,
  CreateDeploymentInput,
  CreateProjectInput,
  CreateSourceInput,
  Deployment,
  EntityRef,
  ProjectFilter,
  SourceFilter,
  SpaceAttachment,
  SpaceProject,
  SpaceSource,
  UpdateProjectPatch,
  UpdateSourcePatch,
  WorkspaceCtx,
} from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

export type SpaceEntityApi = {
  listProjects(
    ctx: WorkspaceCtx,
    space: SpaceId,
    filter?: ProjectFilter,
  ): Promise<SpaceProject[]>;
  listAllProjects(ctx: WorkspaceCtx): Promise<SpaceProject[]>;
  getProject(ctx: WorkspaceCtx, id: string): Promise<SpaceProject | null>;
  createProject(
    ctx: WorkspaceCtx,
    input: CreateProjectInput,
  ): Promise<SpaceProject>;
  updateProject(
    ctx: WorkspaceCtx,
    id: string,
    patch: UpdateProjectPatch,
  ): Promise<SpaceProject>;
  deleteProject(ctx: WorkspaceCtx, id: string): Promise<void>;

  listSources(
    ctx: WorkspaceCtx,
    opts?: SourceFilter,
  ): Promise<SpaceSource[]>;
  createSource(
    ctx: WorkspaceCtx,
    input: CreateSourceInput,
  ): Promise<SpaceSource>;
  updateSource(
    ctx: WorkspaceCtx,
    id: string,
    patch: UpdateSourcePatch,
  ): Promise<SpaceSource>;
  deleteSource(ctx: WorkspaceCtx, id: string): Promise<void>;

  listBriefingItems(
    ctx: WorkspaceCtx,
    filter?: BriefingFilter,
  ): Promise<BriefingItem[]>;
  mutateBriefingItem(
    ctx: WorkspaceCtx,
    id: string,
    action: BriefingAction,
  ): Promise<BriefingItem>;

  listAttachments(ctx: WorkspaceCtx): Promise<SpaceAttachment[]>;
  attachToWork(ctx: WorkspaceCtx, ref: EntityRef): Promise<SpaceAttachment>;
  detachFromWork(ctx: WorkspaceCtx, attachmentId: string): Promise<void>;
  linkReference(
    ctx: WorkspaceCtx,
    ref: EntityRef,
    target: EntityRef,
  ): Promise<void>;

  listDeployments(
    ctx: WorkspaceCtx,
    projectId: string,
  ): Promise<Deployment[]>;
  createDeployment(
    ctx: WorkspaceCtx,
    projectId: string,
    input: CreateDeploymentInput,
  ): Promise<Deployment>;

  /** Subscribe to entity store changes (local adapter). */
  subscribe?(listener: () => void): () => void;
};
