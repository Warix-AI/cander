"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import { DashBtn } from "@/components/spaces/ItemSet";
import { Dropdown } from "@/components/ui/Controls";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
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
    label: "New project",
    summary: "Create",
    kind: "research",
    title: "Search",
  },
];

const EXPLORE_MENU_OPTIONS = [
  {
    id: "quick-search" as const,
    label: "Quick search",
    summary: "Browse",
  },
  ...EXPLORE_CREATE_OPTIONS.map((item) => ({
    id: item.id,
    label: item.label,
    summary: item.summary,
    kind: item.kind,
    title: item.title,
  })),
];

type NewExploreMenuProps = {
  onCreated: (projectId: string) => void;
};

export function NewExploreMenu({ onCreated }: NewExploreMenuProps) {
  const { openQuickSearchBrowser } = useApp();
  const ctx = useWorkspaceCtx();
  const { createProject } = useSpaceMutation();
  const [busy, setBusy] = useState(false);

  const startProject = async () => {
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
    <Dropdown
      align="end"
      matchTrigger={false}
      menuClassName="min-w-[11rem]"
      trigger={({ toggle }) => (
        <DashBtn primary icon onClick={toggle} label="New in Explore">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
        </DashBtn>
      )}
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              close();
              openQuickSearchBrowser();
            }}
            className="flex w-full flex-col rounded-[10px] px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
          >
            <span className="text-[13px] font-medium">Quick search</span>
            <span className="text-[12px] text-muted-foreground">
              {EXPLORE_MENU_OPTIONS[0]!.summary}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              close();
              void startProject();
            }}
            className="flex w-full flex-col rounded-[10px] px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
          >
            <span className="text-[13px] font-medium">New project</span>
            <span className="text-[12px] text-muted-foreground">
              {EXPLORE_CREATE_OPTIONS[0]!.summary}
            </span>
          </button>
        </>
      )}
    </Dropdown>
  );
}
