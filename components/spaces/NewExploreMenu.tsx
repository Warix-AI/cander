"use client";

import { useState } from "react";
import { DashBtn } from "@/components/spaces/ItemSet";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import type { ProjectKind } from "@/lib/space-entities";

export type ExploreStart = {
  id: "search";
  label: string;
  summary: string;
  kind: ProjectKind;
  title: string;
};

/** Explore projects are browser-tab groups (search sessions), not research reports. */
export const EXPLORE_CREATE_OPTIONS: ExploreStart[] = [
  {
    id: "search",
    label: "New search",
    summary: "A group of browser tabs for exploring the web",
    kind: "research",
    title: "Search",
  },
];

type NewExploreMenuProps = {
  onCreated: (projectId: string) => void;
};

export function NewExploreMenu({ onCreated }: NewExploreMenuProps) {
  const ctx = useWorkspaceCtx();
  const { createProject } = useSpaceMutation();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const item = EXPLORE_CREATE_OPTIONS[0]!;
      const project = await createProject(ctx, {
        space: "research",
        title: item.title,
        kind: item.kind,
        summary: item.summary,
      });
      onCreated(project.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashBtn primary onClick={() => void start()} label="New search">
      {busy ? "Creating…" : "New search"}
    </DashBtn>
  );
}
