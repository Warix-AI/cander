"use client";

import { useEffect, useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { getChatStoreSnapshot } from "@/lib/api/chat-store";
import { CONNECTOR_CATALOG } from "@/lib/api/connector-catalog";
import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { removeStoredPin } from "@/lib/session";
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

export function usePinnedItems() {
  const { pins, threads, workspaceId } = useApp();
  const { ctx } = useSpaceData();
  const snap = getSpaceEntityStoreSnapshot();
  const projects = snap.seeded
    ? localSpaceEntityStore.listAllProjects(ctx)
    : [];
  const projectRevision = snap.revision;

  const items = useMemo(() => {
    const resolved: PinnedItem[] = [];
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
      if (pin.kind === "thread") {
        const thread = threads.find(
          (item) => item.id === pin.id && item.workspaceId === workspaceId,
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
        (item) => item.id === pin.id && item.workspaceId === workspaceId,
      );
      if (project) {
        resolved.push({
          kind: "project",
          id: project.id,
          title: project.title,
          spaceId: project.space,
        });
      } else {
        // Show immediately — title fills in when the entity store catches up.
        resolved.push({
          kind: "project",
          id: pin.id,
          title: "Pinned project",
        });
      }
    }
    return resolved;
  }, [pins, threads, workspaceId, projects, projectRevision]);

  useEffect(() => {
    if (!getChatStoreSnapshot().hydrated) return;
    for (const pin of pins) {
      if (pin.kind !== "thread") continue;
      const thread = threads.find(
        (item) => item.id === pin.id && item.workspaceId === workspaceId,
      );
      if (!thread) removeStoredPin("thread", pin.id);
    }
  }, [pins, threads, workspaceId]);

  return { pinnedItems: items };
}
