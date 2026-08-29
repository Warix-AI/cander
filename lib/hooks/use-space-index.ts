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
import { PRIMARY_NAV_SPACES } from "@/lib/spaces";
import type { EntityRef, WorkspaceCtx } from "@/lib/space-entities";
import {
  filterIndexEntries,
  recencyRank,
  sortIndexEntries,
  type SpaceIndexEntry,
} from "@/lib/space-index";
import type { SpaceId, Thread } from "@/lib/types";
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

function readIndexSeed(ctx: WorkspaceCtx) {
  const entity = getSpaceEntityStoreSnapshot();
  const chat = getChatStoreSnapshot();
  return {
    ready: entity.seeded,
    projects: entity.seeded ? localSpaceEntityStore.listAllProjects(ctx) : [],
    sources: entity.seeded ? localSpaceEntityStore.listSources(ctx) : [],
    briefing: entity.seeded ? localSpaceEntityStore.listBriefingItems(ctx) : [],
    threads: filterThreads(chat.threads, ctx.workspaceId),
  };
}

function threadImageCover(thread: Thread): string | undefined {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const blocks = thread.messages[i]?.blocks;
    if (!blocks?.length) continue;
    for (let j = blocks.length - 1; j >= 0; j--) {
      const block = blocks[j];
      if (block?.type === "image" && block.url) return block.url;
    }
  }
  return undefined;
}

export function useSpaceIndex(opts?: {
  space?: SpaceId | "all";
  query?: string;
  enabled?: boolean;
}) {
  const { api, ctx, entityRevision, chatRevision } = useSpaceData();
  const { actor } = useApp();
  const enabled = opts?.enabled !== false;
  const seed = readIndexSeed(ctx);
  const [projects, setProjects] = useState(seed.projects);
  const [sources, setSources] = useState(seed.sources);
  const [briefing, setBriefing] = useState(seed.briefing);
  const [threads, setThreads] = useState<Thread[]>(seed.threads);
  const [loading, setLoading] = useState(!seed.ready);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(seed.ready);
  const lastWorkspace = useRef(ctx.workspaceId);

  // One-shot ingest. Must not depend on entityRevision: syncBriefing notifies
  // the entity store on success, which would re-run this effect and loop.
  useEffect(() => {
    if (!enabled) return;
    void api.connectors.syncBriefing(ctx).catch(() => {});
  }, [api.connectors, ctx, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const nextSeed = readIndexSeed(ctx);
    if (!nextSeed.ready) return;
    setProjects(nextSeed.projects);
    setSources(nextSeed.sources);
    setBriefing(nextSeed.briefing);
    setThreads(nextSeed.threads);
    loaded.current = true;
    setLoading(false);
  }, [ctx, entityRevision, chatRevision, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (lastWorkspace.current !== ctx.workspaceId) {
      lastWorkspace.current = ctx.workspaceId;
      loaded.current = false;
    }
    const nextSeed = readIndexSeed(ctx);
    if (!loaded.current) {
      if (nextSeed.ready) {
        setProjects(nextSeed.projects);
        setSources(nextSeed.sources);
        setBriefing(nextSeed.briefing);
        setThreads(nextSeed.threads);
        loaded.current = true;
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    setError(null);
    Promise.all([
      api.entities.listAllProjects(ctx),
      api.entities.listSources(ctx),
      api.entities.listBriefingItems(ctx),
      api.chat.listThreads(ctx),
    ])
      .then(([nextProjects, nextSources, nextBriefing, nextThreads]) => {
        if (cancelled) return;
        setProjects(nextProjects);
        setSources(nextSources);
        setBriefing(nextBriefing);
        setThreads(nextThreads);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load index");
        }
      })
      .finally(() => {
        loaded.current = true;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api.entities, api.chat, ctx, enabled]);

  const entries = useMemo(() => {
    const usedProjects = new Set<string>();
    const items: SpaceIndexEntry[] = [];

    for (const thread of threads) {
      // Empty space/project docks do not belong in Recents until a turn exists.
      if (!threadHasTurns(thread)) continue;
      // Owner-private: only the current user's chats in the index.
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
        cover: threadImageCover(thread),
        createdById: thread.createdBy,
        createdByName: creator ?? undefined,
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

    for (const item of briefing) {
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
  }, [threads, projects, sources, briefing, opts?.space, opts?.query, actor.id]);

  return { entries, loading: loading && entries.length === 0, error };
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
