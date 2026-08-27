"use client";

import { useEffect, useMemo, useState } from "react";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { connectorName } from "@/lib/api/connector-api";
import { PRIMARY_NAV_SPACES } from "@/lib/spaces";
import type { EntityRef } from "@/lib/space-entities";
import {
  filterIndexEntries,
  recencyRank,
  sortIndexEntries,
  type SpaceIndexEntry,
} from "@/lib/space-index";
import type { SpaceId, Thread } from "@/lib/types";
import { navLabel } from "@/lib/use-main-nav-items";

function spaceLabel(space?: SpaceId) {
  if (!space) return "Chat";
  return navLabel(space) ?? space;
}

export function useSpaceIndex(opts?: { space?: SpaceId | "all"; query?: string }) {
  const { api, ctx, entityRevision, chatRevision } = useSpaceData();
  const [projects, setProjects] = useState<Awaited<
    ReturnType<typeof api.entities.listAllProjects>
  >>([]);
  const [sources, setSources] = useState<Awaited<
    ReturnType<typeof api.entities.listSources>
  >>([]);
  const [briefing, setBriefing] = useState<Awaited<
    ReturnType<typeof api.connectors.syncBriefing>
  >>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.entities.listAllProjects(ctx),
      api.entities.listSources(ctx),
      api.connectors.syncBriefing(ctx),
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api.entities, api.connectors, api.chat, ctx, entityRevision, chatRevision]);

  const entries = useMemo(() => {
    const usedProjects = new Set<string>();
    const items: SpaceIndexEntry[] = [];

    for (const thread of threads) {
      if (thread.projectId) usedProjects.add(thread.projectId);
      items.push({
        key: thread.id,
        kind: "thread",
        entityId: thread.id,
        title: thread.title,
        meta: [spaceLabel(thread.spaceId), "Chat", thread.updatedAt]
          .filter(Boolean)
          .join(" · "),
        space: thread.spaceId,
        workspaceId: thread.workspaceId,
        updatedAt: thread.updatedAt,
        rank: recencyRank(thread.updatedAt),
        badge: "Chat",
        snippet: thread.snippet,
      });
    }

    for (const project of projects) {
      if (usedProjects.has(project.id)) continue;
      items.push({
        key: project.id,
        kind: "project",
        entityId: project.id,
        title: project.title,
        meta: [spaceLabel(project.space), "Project", project.updatedAt]
          .filter(Boolean)
          .join(" · "),
        space: project.space,
        workspaceId: project.workspaceId,
        updatedAt: project.updatedAt,
        rank: recencyRank(project.updatedAt),
        cover: project.cover,
        badge:
          project.status === "published" ? "Published" : spaceLabel(project.space),
        snippet: project.summary,
      });
    }

    for (const source of sources) {
      items.push({
        key: source.id,
        kind: "source",
        entityId: source.id,
        title: source.title,
        meta: [spaceLabel(source.space), source.kind, source.updatedAt]
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
        meta: [connectorName(item.connectorId ?? "work"), item.updatedAt]
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
  }, [threads, projects, sources, briefing, opts?.space, opts?.query]);

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
