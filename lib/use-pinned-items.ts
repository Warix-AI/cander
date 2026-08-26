"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { CONNECTOR_CATALOG } from "@/lib/api/connector-catalog";
import type { PinKind, SpaceId } from "@/lib/types";

export type PinnedItem = {
  kind: PinKind;
  id: string;
  title: string;
  icon?: string;
  spaceId?: SpaceId;
};

export function usePinnedItems() {
  const { pins, threads, workspace } = useApp();
  const { api, ctx, entityRevision } = useSpaceData();
  const [projects, setProjects] = useState<
    Awaited<ReturnType<typeof api.entities.listAllProjects>>
  >([]);

  useEffect(() => {
    let cancelled = false;
    api.entities.listAllProjects(ctx).then((items) => {
      if (!cancelled) setProjects(items);
    });
    return () => {
      cancelled = true;
    };
  }, [api.entities, ctx, entityRevision]);

  const items = useMemo(() => {
    const resolved: PinnedItem[] = [];
    for (const pin of pins) {
      if (pin.kind === "connector") {
        const connector = CONNECTOR_CATALOG.find((item) => item.id === pin.id);
        if (connector) {
          resolved.push({
            kind: "connector",
            id: connector.id,
            title: connector.name,
          });
        }
        continue;
      }
      if (pin.kind === "thread") {
        const thread = threads.find(
          (item) => item.id === pin.id && item.workspaceId === workspace.id,
        );
        if (thread) {
          resolved.push({
            kind: "thread",
            id: thread.id,
            title: thread.title,
            spaceId: thread.spaceId,
          });
        }
        continue;
      }
      const project = projects.find(
        (item) => item.id === pin.id && item.workspaceId === workspace.id,
      );
      if (project) {
        resolved.push({
          kind: "project",
          id: project.id,
          title: project.title,
          spaceId: project.space,
        });
      }
    }
    return resolved;
  }, [pins, threads, workspace.id, projects]);

  return { pinnedItems: items };
}
