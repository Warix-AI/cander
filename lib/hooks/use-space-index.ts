"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { useApp } from "@/components/app/AppProvider";
import { connectorName } from "@/lib/api/connector-api";
import { filterThreads, getChatStoreSnapshot } from "@/lib/api/chat-store";
import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { imageCoverFromMessages } from "@/lib/chat-image-cover";
import { PRIMARY_NAV_SPACES } from "@/lib/spaces";
import type { EntityRef, WorkspaceCtx } from "@/lib/space-entities";
import {
  filterIndexEntries,
  recencyRank,
  sortIndexEntries,
  type SpaceIndexEntry,
} from "@/lib/space-index";
import type { SpaceId, Thread } from "@/lib/types";
import { filterRealBriefingItems } from "@/lib/briefing-real";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { threadHasTurns } from "@/lib/persistent-chat";
import { navLabel } from "@/lib/use-main-nav-items";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { workspaceKindOf } from "@/lib/workspace-kind";
import {
  creatorLabel,
  sharedWorkspaceAttribution,
} from "@/lib/workspace-membership";
import { policyFor } from "@/lib/workspace-policy";

function spaceLabel(space?: SpaceId) {
  if (!space) return "Chat";
  return navLabel(space) ?? space;
}

function metaParts(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" · ");
}

function attributionFor(
  workspaceId: string,
  createdBy: string | undefined,
  actorId: string,
): string | null {
  const workspace = getWorkspaceCatalogSnapshot().find((item) => item.id === workspaceId);
  const policy = policyFor(workspaceId);
  if (
    !workspace ||
    !sharedWorkspaceAttribution(policy.members.length, workspaceKindOf(workspace))
  ) {
    return null;
  }
  return creatorLabel(createdBy, actorId);
}

function threadCover(
  thread: Thread,
  remoteCovers: Record<string, string>,
): string | undefined {
  return remoteCovers[thread.id] ?? imageCoverFromMessages(thread.messages);
}

export function useSpaceIndex(opts?: {
  space?: SpaceId | "all";
  query?: string;
  enabled?: boolean;
}) {
  const { api, ctx, entityRevision, chatRevision } = useSpaceData();
  const { actor } = useApp();
  const enabled = opts?.enabled !== false;

  const threads = useMemo(() => {
    void chatRevision;
    return filterThreads(getChatStoreSnapshot().threads, ctx.workspaceId);
  }, [ctx.workspaceId, chatRevision]);

  const projects = useMemo(() => {
    void entityRevision;
    const entity = getSpaceEntityStoreSnapshot();
    return entity.seeded ? localSpaceEntityStore.listAllProjects(ctx) : [];
  }, [ctx, entityRevision]);

  const sources = useMemo(() => {
    void entityRevision;
    const entity = getSpaceEntityStoreSnapshot();
    return entity.seeded ? localSpaceEntityStore.listSources(ctx) : [];
  }, [ctx, entityRevision]);

  const briefing = useMemo(() => {
    void entityRevision;
    const entity = getSpaceEntityStoreSnapshot();
    return entity.seeded
      ? filterRealBriefingItems(localSpaceEntityStore.listBriefingItems(ctx))
      : [];
  }, [ctx, entityRevision]);

  const [remoteCovers, setRemoteCovers] = useState<Record<string, string>>({});
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverKey = useRef("");
  const lastWorkspace = useRef(ctx.workspaceId);

  useEffect(() => {
    if (!enabled) return;
    void api.connectors.syncBriefing(ctx).catch(() => {});
  }, [api.connectors, ctx, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const turnThreadIds = threads
      .filter((thread) => threadHasTurns(thread))
      .map(
        (thread) =>
          `${thread.id}:${thread.updatedAt}:${thread.messages.at(-1)?.id ?? ""}`,
      )
      .sort()
      .join(",");
    if (coverKey.current === turnThreadIds) return;
    coverKey.current = turnThreadIds;
    if (!turnThreadIds) {
      setRemoteCovers({});
      return;
    }
    let cancelled = false;
    void api.chat
      .getThreadCoverUrls(ctx, turnThreadIds.split(","))
      .then((map) => {
        if (cancelled) return;
        setRemoteCovers(Object.fromEntries(map));
      })
      .catch(() => {
        if (!cancelled) setRemoteCovers({});
      });
    return () => {
      cancelled = true;
    };
  }, [api.chat, ctx, enabled, threads]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (lastWorkspace.current !== ctx.workspaceId) {
      lastWorkspace.current = ctx.workspaceId;
      setRemoteCovers({});
      coverKey.current = "";
    }
    setEntitiesLoading(true);
    setError(null);
    Promise.all([
      api.entities.listAllProjects(ctx),
      api.entities.listSources(ctx),
      api.entities.listBriefingItems(ctx),
    ])
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load index");
        }
      })
      .finally(() => {
        if (!cancelled) setEntitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api.entities, ctx, enabled]);

  const entries = useMemo(() => {
    const usedProjects = new Set<string>();
    const items: SpaceIndexEntry[] = [];

    for (const thread of threads) {
      if (!threadHasTurns(thread)) continue;
      if (thread.createdBy && thread.createdBy !== actor.id) continue;
      if (thread.projectId) usedProjects.add(thread.projectId);
      const creator = attributionFor(thread.workspaceId, thread.createdBy, actor.id);
      items.push({
        key: thread.id,
        kind: "thread",
        entityId: thread.id,
        title: thread.title,
        meta: metaParts([
          spaceLabel(thread.spaceId),
          "Chat",
          creator,
          formatRelativeTime(thread.updatedAt),
        ]),
        space: thread.spaceId,
        workspaceId: thread.workspaceId,
        updatedAt: thread.updatedAt,
        rank: recencyRank(thread.updatedAt),
        badge: "Chat",
        snippet: thread.snippet,
        cover: threadCover(thread, remoteCovers),
        createdById: thread.createdBy,
        createdByName: creator ?? undefined,
        linkedProjectId: thread.projectId,
      });
    }

    for (const project of projects) {
      if (usedProjects.has(project.id)) continue;
      const creator = attributionFor(project.workspaceId, project.createdBy, actor.id);
      items.push({
        key: project.id,
        kind: "project",
        entityId: project.id,
        title: project.title,
        meta: metaParts([
          spaceLabel(project.space),
          "Project",
          creator,
          formatRelativeTime(project.updatedAt),
        ]),
        space: project.space,
        workspaceId: project.workspaceId,
        updatedAt: project.updatedAt,
        rank: recencyRank(project.updatedAt),
        cover: project.cover,
        badge:
          project.status === "published" ? "Published" : spaceLabel(project.space),
        snippet: project.summary,
        createdById: project.createdBy,
        createdByName: creator ?? undefined,
      });
    }

    for (const source of sources) {
      items.push({
        key: source.id,
        kind: "source",
        entityId: source.id,
        title: source.title,
        meta: [spaceLabel(source.space), source.kind, formatRelativeTime(source.updatedAt)]
          .filter(Boolean)
          .join(" · "),
        space: source.space,
        workspaceId: source.workspaceId,
        updatedAt: source.updatedAt,
        rank: recencyRank(source.updatedAt),
        snippet: source.url,
      });
    }

    for (const item of filterRealBriefingItems(briefing)) {
      items.push({
        key: item.id,
        kind: "briefing",
        entityId: item.id,
        title: item.title,
        meta: [connectorName(item.connectorId ?? "work"), formatRelativeTime(item.updatedAt)]
          .filter(Boolean)
          .join(" · "),
        space: "work",
        workspaceId: item.workspaceId,
        updatedAt: item.updatedAt,
        rank: recencyRank(item.updatedAt),
        snippet: item.summary,
      });
    }

    let sorted = sortIndexEntries(items);
    if (opts?.space && opts.space !== "all") {
      sorted = sorted.filter((item) => item.space === opts.space);
    }
    if (opts?.query) {
      sorted = filterIndexEntries(sorted, opts.query);
    }
    return sorted;
  }, [
    threads,
    projects,
    sources,
    briefing,
    remoteCovers,
    opts?.space,
    opts?.query,
    actor.id,
  ]);

  const entityReady = getSpaceEntityStoreSnapshot().seeded;
  const loading =
    entitiesLoading && entries.length === 0 && !entityReady && !threads.length;

  return { entries, loading, error };
}

export function openIndexEntry(
  entry: SpaceIndexEntry,
  actions: {
    openThread: (id: string) => void;
    openProject: (id: string) => void;
    openSpaceEntity: (ref: EntityRef) => void;
  },
) {
  if (entry.kind === "thread") {
    actions.openThread(entry.entityId);
    return;
  }
  if (entry.kind === "project") {
    actions.openProject(entry.entityId);
    return;
  }
  actions.openSpaceEntity({
    type: entry.kind,
    id: entry.entityId,
    space: entry.space ?? "research",
    workspaceId: entry.workspaceId,
    label: entry.title,
    snapshot: entry.snippet,
  });
}

export { PRIMARY_NAV_SPACES };
