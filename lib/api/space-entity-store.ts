import { projects as seedProjects, researchSources } from "@/lib/data";
import { workItems } from "@/lib/work-catalog";
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
import { bumpVersion, newEntityTimestamps, newId } from "@/lib/space-entities";
import type { Project, SpaceId } from "@/lib/types";
import {
  attachWorkApp,
  detachWorkApp,
  getWorkAppsSnapshot,
  subscribeWorkApps,
  workAppIds,
} from "@/lib/work-apps";

const STORAGE_KEY = "courier-space-entities-v1";

type PersistedState = {
  projects: SpaceProject[];
  sources: SpaceSource[];
  briefingItems: BriefingItem[];
  deployments: Deployment[];
  seeded: boolean;
  revision: number;
};

type Listener = () => void;
const listeners = new Set<Listener>();

let state: PersistedState = {
  projects: [],
  sources: [],
  briefingItems: [],
  deployments: [],
  seeded: false,
  revision: 0,
};
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): PersistedState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function projectKindFromSpace(space: SpaceId): SpaceProject["kind"] {
  if (space === "build") return "app";
  if (space === "research") return "research";
  if (space === "work") return "general";
  return "general";
}

function seedProject(project: Project): SpaceProject {
  const timestamps = newEntityTimestamps();
  return {
    ...timestamps,
    id: project.id,
    space: project.space,
    workspaceId: project.workspaceId,
    title: project.name,
    summary: project.summary,
    cover: project.cover,
    kind: projectKindFromSpace(project.space),
    status: "active",
    threadId: project.threadId,
    domains: project.domains,
  };
}

function seedSources(): SpaceSource[] {
  return researchSources.map((source, index) => ({
    ...newEntityTimestamps(),
    id: `src-${index + 1}`,
    space: "research" as const,
    workspaceId: "ws-personal",
    title: source.title,
    kind: "web" as const,
    url: source.url.startsWith("http") ? source.url : `https://${source.url}`,
    folderId: null,
    citationMeta: source.tag ? { tag: source.tag } : undefined,
  }));
}

function seedBriefing(): BriefingItem[] {
  return workItems
    .filter((item) => item.lanes.includes("today"))
    .map((item) => ({
      ...newEntityTimestamps(),
      id: item.id,
      workspaceId: item.workspaceId,
      connectorId: item.connectorId,
      tone: item.tone ?? "neutral",
      title: item.title,
      summary: item.summary,
      prompt: item.prompt,
    }));
}

function ensureSeed() {
  if (state.seeded && state.projects.length > 0) return;
  state = {
    projects: seedProjects.map(seedProject),
    sources: seedSources(),
    briefingItems: seedBriefing(),
    deployments: [],
    seeded: true,
    revision: 0,
  };
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = parse(window.localStorage.getItem(STORAGE_KEY));
  if (stored?.seeded) {
    state = stored;
    return;
  }
  ensureSeed();
  persist();
}

function persist() {
  if (typeof window === "undefined") return;
  state = { ...state, revision: state.revision + 1 };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emit();
}

function assertWorkspace<T extends { workspaceId: string }>(
  ctx: WorkspaceCtx,
  entity: T,
) {
  if (entity.workspaceId !== ctx.workspaceId) {
    throw new Error("Entity workspace mismatch");
  }
}

export function subscribeSpaceEntityStore(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSpaceEntityStoreSnapshot(): PersistedState {
  hydrate();
  return state;
}

export function getSpaceEntityStoreServerSnapshot(): PersistedState {
  return {
    projects: [],
    sources: [],
    briefingItems: [],
    deployments: [],
    seeded: false,
    revision: 0,
  };
}

function filterProjects(
  items: SpaceProject[],
  ctx: WorkspaceCtx,
  space: SpaceId,
  filter?: ProjectFilter,
) {
  return items.filter((project) => {
    if (project.workspaceId !== ctx.workspaceId) return false;
    if (project.space !== space) return false;
    if (filter?.kind && project.kind !== filter.kind) return false;
    if (filter?.status && project.status !== filter.status) return false;
    return true;
  });
}

export const localSpaceEntityStore = {
  listProjects(ctx: WorkspaceCtx, space: SpaceId, filter?: ProjectFilter) {
    hydrate();
    return filterProjects(state.projects, ctx, space, filter);
  },

  listAllProjects(ctx: WorkspaceCtx) {
    hydrate();
    return state.projects.filter((item) => item.workspaceId === ctx.workspaceId);
  },

  getProject(ctx: WorkspaceCtx, id: string) {
    hydrate();
    const project = state.projects.find((item) => item.id === id) ?? null;
    if (project) assertWorkspace(ctx, project);
    return project;
  },

  createProject(ctx: WorkspaceCtx, input: CreateProjectInput) {
    hydrate();
    const project: SpaceProject = {
      ...newEntityTimestamps(),
      id: newId(),
      workspaceId: ctx.workspaceId,
      space: input.space,
      title: input.title,
      summary: input.summary ?? "",
      cover: input.cover,
      kind: input.kind ?? projectKindFromSpace(input.space),
      status: "draft",
      instructions: input.instructions,
    };
    state = { ...state, projects: [project, ...state.projects] };
    persist();
    return project;
  },

  updateProject(ctx: WorkspaceCtx, id: string, patch: UpdateProjectPatch) {
    hydrate();
    const index = state.projects.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Project not found");
    const current = state.projects[index]!;
    assertWorkspace(ctx, current);
    const next = bumpVersion({ ...current, ...patch });
    const projects = [...state.projects];
    projects[index] = next;
    state = { ...state, projects };
    persist();
    return next;
  },

  deleteProject(ctx: WorkspaceCtx, id: string) {
    hydrate();
    const project = state.projects.find((item) => item.id === id);
    if (project) assertWorkspace(ctx, project);
    state = {
      ...state,
      projects: state.projects.filter((item) => item.id !== id),
      sources: state.sources.filter((item) => item.projectId !== id),
      deployments: state.deployments.filter((item) => item.projectId !== id),
    };
    persist();
  },

  listSources(ctx: WorkspaceCtx, opts?: SourceFilter) {
    hydrate();
    return state.sources.filter((source) => {
      if (source.workspaceId !== ctx.workspaceId) return false;
      if (opts?.space && source.space !== opts.space) return false;
      if (opts?.projectId && source.projectId !== opts.projectId) return false;
      if (opts?.folderId !== undefined && source.folderId !== opts.folderId) {
        return false;
      }
      if (opts?.kind && source.kind !== opts.kind) return false;
      return true;
    });
  },

  createSource(ctx: WorkspaceCtx, input: CreateSourceInput) {
    hydrate();
    const source: SpaceSource = {
      ...newEntityTimestamps(),
      id: newId(),
      workspaceId: ctx.workspaceId,
      space: input.space,
      title: input.title,
      kind: input.kind,
      projectId: input.projectId,
      url: input.url,
      fileId: input.fileId,
      folderId: input.folderId ?? null,
      citationMeta: input.citationMeta,
    };
    state = { ...state, sources: [source, ...state.sources] };
    persist();
    return source;
  },

  updateSource(ctx: WorkspaceCtx, id: string, patch: UpdateSourcePatch) {
    hydrate();
    const index = state.sources.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Source not found");
    const current = state.sources[index]!;
    assertWorkspace(ctx, current);
    const next = bumpVersion({ ...current, ...patch });
    const sources = [...state.sources];
    sources[index] = next;
    state = { ...state, sources };
    persist();
    return next;
  },

  deleteSource(ctx: WorkspaceCtx, id: string) {
    hydrate();
    const source = state.sources.find((item) => item.id === id);
    if (source) assertWorkspace(ctx, source);
    state = {
      ...state,
      sources: state.sources.filter((item) => item.id !== id),
    };
    persist();
  },

  listBriefingItems(ctx: WorkspaceCtx, filter?: BriefingFilter) {
    hydrate();
    return state.briefingItems.filter((item) => {
      if (item.workspaceId !== ctx.workspaceId) return false;
      if (filter?.tone && item.tone !== filter.tone) return false;
      if (filter?.connectorId && item.connectorId !== filter.connectorId) {
        return false;
      }
      if (filter?.area === "inbox" && item.connectorId !== "gmail") {
        return false;
      }
      if (filter?.area === "calendar" && item.connectorId !== "calendar") {
        return false;
      }
      if (filter?.area === "customers" && item.connectorId !== "handshake") {
        return false;
      }
      if (item.snoozedUntil && new Date(item.snoozedUntil) > new Date()) {
        return false;
      }
      return true;
    });
  },

  mutateBriefingItem(ctx: WorkspaceCtx, id: string, action: BriefingAction) {
    hydrate();
    const index = state.briefingItems.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Briefing item not found");
    const current = state.briefingItems[index]!;
    assertWorkspace(ctx, current);
    let next = current;
    if (action === "snooze") {
      const until = new Date();
      until.setHours(until.getHours() + 24);
      next = bumpVersion({
        ...current,
        snoozedUntil: until.toISOString(),
      });
    } else if (action === "dismiss") {
      state = {
        ...state,
        briefingItems: state.briefingItems.filter((item) => item.id !== id),
      };
      persist();
      return current;
    } else if (action === "mark_ready") {
      next = bumpVersion({ ...current, tone: "ready" });
    }
    const briefingItems = [...state.briefingItems];
    briefingItems[index] = next;
    state = { ...state, briefingItems };
    persist();
    return next;
  },

  listAttachments(ctx: WorkspaceCtx): SpaceAttachment[] {
    hydrate();
    const ids = workAppIds(ctx.workspaceId);
    const now = new Date().toISOString();
    return ids.map((targetId) => ({
      id: `attach-${targetId}`,
      workspaceId: ctx.workspaceId,
      kind: "buildApp" as const,
      targetId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }));
  },

  attachToWork(ctx: WorkspaceCtx, ref: EntityRef) {
    if (ref.type === "project") {
      attachWorkApp(ctx.workspaceId, ref.id);
    }
    const attachment: SpaceAttachment = {
      ...newEntityTimestamps(),
      id: newId(),
      workspaceId: ctx.workspaceId,
      kind: ref.type === "project" ? "buildApp" : "connector",
      targetId: ref.id,
      label: ref.label,
    };
    return attachment;
  },

  detachFromWork(ctx: WorkspaceCtx, attachmentId: string) {
    const targetId = attachmentId.replace(/^attach-/, "");
    detachWorkApp(ctx.workspaceId, targetId);
  },

  linkReference(_ctx: WorkspaceCtx, _ref: EntityRef, _target: EntityRef) {
    // Cross-entity links are persisted when backend arrives; no-op locally.
  },

  listDeployments(ctx: WorkspaceCtx, projectId: string) {
    hydrate();
    return state.deployments.filter(
      (item) =>
        item.workspaceId === ctx.workspaceId && item.projectId === projectId,
    );
  },

  createDeployment(
    ctx: WorkspaceCtx,
    projectId: string,
    input: CreateDeploymentInput,
  ) {
    hydrate();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Project not found");
    assertWorkspace(ctx, project);
    const deployment: Deployment = {
      ...newEntityTimestamps(),
      id: newId(),
      projectId,
      workspaceId: ctx.workspaceId,
      url: input.url,
      status: input.status ?? "live",
    };
    state = { ...state, deployments: [deployment, ...state.deployments] };
    const projects = state.projects.map((item) =>
      item.id === projectId
        ? bumpVersion({
            ...item,
            status: "published" as const,
            publishedUrl: input.url,
          })
        : item,
    );
    state = { ...state, projects };
    persist();
    return deployment;
  },
};

/** Re-emit when work-app attachments change outside the entity store. */
if (typeof window !== "undefined") {
  subscribeWorkApps(() => emit());
}

export function workAppsSnapshotForWorkspace(workspaceId: string) {
  hydrate();
  return getWorkAppsSnapshot()[workspaceId] ?? [];
}
