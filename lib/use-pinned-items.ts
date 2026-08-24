"use client";

import { useApp } from "@/components/app/AppProvider";
import { connectors, projects } from "@/lib/data";
import type { PinTier, SpaceId } from "@/lib/types";

export type PinnedItem = {
  kind: "thread" | "project" | "connector";
  id: string;
  title: string;
  tier: PinTier;
  icon?: string;
  spaceId?: SpaceId;
};

export function usePinnedItems() {
  const { pins, threads, workspace } = useApp();

  const items: PinnedItem[] = [];
  for (const pin of pins) {
    const tier: PinTier =
      pin.tier === "secondary" ? "secondary" : "primary";
    if (pin.kind === "connector") {
      const connector = connectors.find((item) => item.id === pin.id);
      if (connector) {
        items.push({
          kind: "connector",
          id: connector.id,
          title: connector.name,
          icon: connector.icon,
          tier,
        });
      }
      continue;
    }
    if (pin.kind === "thread") {
      const thread = threads.find(
        (item) =>
          item.id === pin.id &&
          item.workspaceId === workspace.id &&
          (item.product ?? "courier") === "courier",
      );
      if (thread) {
        items.push({
          kind: "thread",
          id: thread.id,
          title: thread.title,
          spaceId: thread.spaceId,
          tier,
        });
      }
      continue;
    }
    const project = projects.find(
      (item) => item.id === pin.id && item.workspaceId === workspace.id,
    );
    if (project) {
      items.push({
        kind: "project",
        id: project.id,
        title: project.name,
        spaceId: project.space,
        tier,
      });
    }
  }

  return {
    primaryItems: items.filter((item) => item.tier === "primary"),
    secondaryItems: items.filter((item) => item.tier === "secondary"),
    allItems: items,
  };
}
