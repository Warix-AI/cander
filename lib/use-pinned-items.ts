"use client";

import { useEffect, useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { CONNECTOR_CATALOG } from "@/lib/api/connector-catalog";
import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { healMisclassifiedPins } from "@/lib/session";
import type { PinKind, SpaceId } from "@/lib/types";

export type PinnedItem = {
  kind: PinKind;
  id: string;
  title: string;
  icon?: string;
  spaceId?: SpaceId;
};

/** Short sidebar labels — full product names stay in catalog / detail. */
const PIN_CONNECTOR_TITLE: Record<string, string> = {
  gmail: "Gmail",
  gcal: "Calendar",
  gdrive: "Drive",
  gsheets: "Sheets",
  gdocs: "Documents",
};

function pinConnectorTitle(id: string, catalogName?: string) {
  return PIN_CONNECTOR_TITLE[id] ?? catalogName ?? id;
}

function chatDisplayTitle(title: string | undefined, snippet?: string) {
  const name = title?.trim();
  if (name && name !== "Chat") return name;
  const fromSnippet = snippet?.trim();
  if (fromSnippet) return fromSnippet.slice(0, 48);
  return "Pinned chat";
}

export function usePinnedItems() {
  const { pins, threads, workspaceId } = useApp();
  const { ctx } = useSpaceData();
  const snap = getSpaceEntityStoreSnapshot();
  const projects = snap.seeded
    ? localSpaceEntityStore.listAllProjects(ctx)
    : [];
  const projectRevision = snap.revision;

  useEffect(() => {
    healMisclassifiedPins({
      threadIds: threads.map((item) => item.id),
      projectIds: projects.map((item) => item.id),
    });
  }, [pins, threads, projects, projectRevision]);

  const items = useMemo(() => {
    const resolved: PinnedItem[] = [];
    const projectById = new Map(
      projects
        .filter((item) => item.workspaceId === workspaceId)
        .map((item) => [item.id, item] as const),
    );
    const threadById = new Map(threads.map((item) => [item.id, item] as const));

    for (const pin of pins) {
      if (pin.kind === "connector") {
        const connector = CONNECTOR_CATALOG.find((item) => item.id === pin.id);
        resolved.push({
          kind: "connector",
          id: pin.id,
          title: pinConnectorTitle(pin.id, connector?.name),
          icon: connector?.id ?? pin.id,
        });
        continue;
      }

      // Prefer thread resolution when a project pin id is actually a chat
      // (legacy Recents pin bug), or when kind is already thread.
      const thread = threadById.get(pin.id);
      const project = projectById.get(pin.id);

      if (pin.kind === "thread" || (pin.kind === "project" && thread && !project)) {
        if (thread && thread.workspaceId === workspaceId) {
          resolved.push({
            kind: "thread",
            id: thread.id,
            title: chatDisplayTitle(thread.title, thread.snippet),
            spaceId: thread.spaceId,
          });
        } else if (thread) {
          resolved.push({
            kind: "thread",
            id: pin.id,
            title: chatDisplayTitle(thread.title, thread.snippet),
            spaceId: thread.spaceId,
          });
        } else {
          resolved.push({
            kind: "thread",
            id: pin.id,
            title: "Pinned chat",
          });
        }
        continue;
      }

      if (project) {
        resolved.push({
          kind: "project",
          id: project.id,
          title: project.title,
          spaceId: project.space,
        });
      } else {
        resolved.push({
          kind: "project",
          id: pin.id,
          title: "Pinned project",
        });
      }
    }
    return resolved;
  }, [pins, threads, workspaceId, projects, projectRevision]);

  return { pinnedItems: items };
}
