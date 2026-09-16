"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { CONNECTOR_CATALOG, compareConnectorCatalogOrder } from "@/lib/api/connector-catalog";
import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { imageCoverFromMessages } from "@/lib/chat-image-cover";
import {
  connectedConnectorIdsLive,
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import { expertCatalogEntry } from "@/lib/expert-catalog";
import { ensureConnectedAppsPinned } from "@/lib/ensure-connected-apps-pinned";
import { threadHasTurns } from "@/lib/persistent-chat";
import {
  projectCoverGradientClass,
  projectCoverImageSrc,
} from "@/lib/project-cover";
import { healMisclassifiedPins } from "@/lib/session";
import type { ProjectKind } from "@/lib/space-entities";
import type { PinKind, SpaceId, Thread } from "@/lib/types";

export type PinnedItem = {
  kind: PinKind;
  id: string;
  title: string;
  icon?: string;
  spaceId?: SpaceId;
  /** Set for project pins — drives Agents / Websites / Apps / … folders. */
  projectKind?: ProjectKind;
  /** Catalog expert pin (sidebar Experts) — not a real space project yet. */
  expertCatalog?: boolean;
  /** Expert type for hover (“Summarize expert”). */
  expertKind?: string;
  /** Live preview image URL (project cover or chat image). */
  coverImage?: string;
  /** Banner gradient class when cover is a preset (projects). */
  coverGradient?: string;
};

/**
 * Short sidebar pin labels — always the connector product, never the account
 * display name (e.g. “Personal”). Account names belong on browser tabs only.
 */
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
  return "Chat";
}

/** Chats that belong in the sidebar Chats folder (not Apps / project folders). */
function isSidebarChat(thread: Thread, workspaceId: string) {
  if (thread.workspaceId !== workspaceId) return false;
  // Connector one-chat threads live under Apps.
  if (thread.connectorId) return false;
  // Project chats are reached via project pins (Canvas / Build / …).
  if (thread.projectId) return false;
  // New / empty drafts stay off the list until the user sends a message.
  if (!threadHasTurns(thread)) return false;
  return true;
}

function threadToPinnedItem(thread: Thread): PinnedItem {
  return {
    kind: "thread",
    id: thread.id,
    title: chatDisplayTitle(thread.title, thread.snippet),
    spaceId: thread.spaceId,
    coverImage: imageCoverFromMessages(thread.messages),
  };
}

function connectorPinnedItem(id: string): PinnedItem {
  const connector = CONNECTOR_CATALOG.find((item) => item.id === id);
  return {
    kind: "connector",
    id,
    title: pinConnectorTitle(id, connector?.name),
    icon: connector?.id ?? id,
  };
}

/**
 * Sidebar rows: connector/project pins from the pin store, live connected
 * apps (so Apps appear right after sign-in), plus every workspace chat under
 * Chats (no manual pin required).
 */
export function usePinnedItems() {
  const { pins, threads, workspaceId } = useApp();
  const { ctx } = useSpaceData();
  const snap = getSpaceEntityStoreSnapshot();
  const projects = snap.seeded
    ? localSpaceEntityStore.listAllProjects(ctx)
    : [];
  const projectRevision = snap.revision;
  const connectionsSnap = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );

  useEffect(() => {
    healMisclassifiedPins({
      threadIds: threads.map((item) => item.id),
      projectIds: projects.map((item) => item.id),
    });
  }, [pins, threads, projects, projectRevision]);

  // After connections hydrate (post sign-in), pin any connected apps missing
  // from the sidebar so Apps populate without a manual refresh.
  useEffect(() => {
    ensureConnectedAppsPinned(workspaceId);
  }, [workspaceId, connectionsSnap]);

  const items = useMemo(() => {
    const resolved: PinnedItem[] = [];
    const projectById = new Map(
      projects
        .filter((item) => item.workspaceId === workspaceId)
        .map((item) => [item.id, item] as const),
    );
    const threadById = new Map(threads.map((item) => [item.id, item] as const));
    const seenThreadIds = new Set<string>();
    const seenConnectorIds = new Set<string>();

    for (const pin of pins) {
      if (pin.kind === "connector") {
        seenConnectorIds.add(pin.id);
        resolved.push(connectorPinnedItem(pin.id));
        continue;
      }

      // Thread pins are superseded by auto-listed chats below.
      if (pin.kind === "thread") continue;

      const thread = threadById.get(pin.id);
      const project = projectById.get(pin.id);

      // Legacy: chat mis-pinned as project with no project row.
      if (pin.kind === "project" && thread && !project) {
        if (
          isSidebarChat(thread, workspaceId) &&
          !seenThreadIds.has(thread.id)
        ) {
          seenThreadIds.add(thread.id);
          resolved.push(threadToPinnedItem(thread));
        }
        continue;
      }

      if (project) {
        resolved.push({
          kind: "project",
          id: project.id,
          title: project.title,
          spaceId: project.space,
          projectKind: project.kind,
          coverImage: projectCoverImageSrc(project.cover),
          coverGradient: projectCoverGradientClass(project.cover),
        });
      } else {
        const expert = expertCatalogEntry(pin.id);
        if (expert) {
          resolved.push({
            kind: "project",
            id: expert.id,
            title: expert.name,
            projectKind: "automation",
            expertCatalog: true,
            expertKind: expert.kind,
            icon: expert.icon,
            coverImage: expert.icon,
          });
        } else {
          resolved.push({
            kind: "project",
            id: pin.id,
            title: "Pinned project",
          });
        }
      }
    }

    // Live connections fill Apps immediately after sign-in, even before pins sync.
    // Catalog order matches ensureConnectedAppsPinned so mobile/desktop agree.
    const liveConnectors = connectedConnectorIdsLive(workspaceId)
      .filter((connectorId) => !seenConnectorIds.has(connectorId))
      .sort(compareConnectorCatalogOrder);
    for (const connectorId of liveConnectors) {
      seenConnectorIds.add(connectorId);
      resolved.push(connectorPinnedItem(connectorId));
    }

    // Auto-list every workspace chat under Chats (recency order).
    const chatThreads = threads
      .filter((thread) => isSidebarChat(thread, workspaceId))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    for (const thread of chatThreads) {
      if (seenThreadIds.has(thread.id)) continue;
      seenThreadIds.add(thread.id);
      resolved.push(threadToPinnedItem(thread));
    }

    return resolved;
  }, [pins, threads, workspaceId, projects, projectRevision, connectionsSnap]);

  return { pinnedItems: items };
}
