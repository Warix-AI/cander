"use client";

import { Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { DashBtn } from "@/components/spaces/ItemSet";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { Dropdown } from "@/components/ui/Controls";
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

type NewExploreMenuProps = {
  onCreated: (projectId: string) => void;
};

export function NewExploreMenu({ onCreated }: NewExploreMenuProps) {
  const { openQuickSearchBrowser } = useApp();
  const { openCreate, busy, modal } = useCreateProjectFlow(onCreated);

  return (
    <>
      <Dropdown
        align="end"
        matchTrigger={false}
        menuClassName="min-w-[11rem]"
        trigger={({ toggle }) => (
          <DashBtn primary icon onClick={toggle} label="New in Home">
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
              <span className="text-[12px] text-muted-foreground">Browse</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                close();
                const item = EXPLORE_CREATE_OPTIONS[0]!;
                openCreate({
                  space: "research",
                  kind: item.kind,
                  defaultTitle: item.title,
                  summary: item.summary,
                });
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
      {modal}
    </>
  );
}
