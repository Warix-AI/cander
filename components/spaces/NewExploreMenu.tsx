"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { DashBtn } from "@/components/spaces/ItemSet";
import { Dropdown } from "@/components/ui/Controls";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import type { ProjectKind } from "@/lib/space-entities";

export type ExploreStart = {
  id: "research" | "report" | "search";
  label: string;
  summary: string;
  kind: ProjectKind;
  title: string;
};

export const EXPLORE_CREATE_OPTIONS: ExploreStart[] = [
  {
    id: "research",
    label: "Research",
    summary: "Deep dive with notes and sources",
    kind: "research",
    title: "New Research",
  },
  {
    id: "report",
    label: "Report",
    summary: "Summarize findings into a report",
    kind: "general",
    title: "New Report",
  },
  {
    id: "search",
    label: "Search",
    summary: "Browse the web from Explore",
    kind: "research",
    title: "Search",
  },
];

const exploreStarts = EXPLORE_CREATE_OPTIONS;

type NewExploreMenuProps = {
  onCreated: (projectId: string) => void;
};

export function NewExploreMenu({ onCreated }: NewExploreMenuProps) {
  const ctx = useWorkspaceCtx();
  const { createProject } = useSpaceMutation();
  const [busy, setBusy] = useState(false);

  const start = async (item: ExploreStart) => {
    if (busy) return;
    setBusy(true);
    try {
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
      trigger={({ open, toggle }) => (
        <DashBtn primary onClick={toggle} label="New explore">
          New
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            strokeWidth={1.8}
          />
        </DashBtn>
      )}
    >
      {(close) => (
        <>
          {exploreStarts.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                void start(item).then(() => close());
              }}
              className="flex w-full flex-col rounded-[10px] px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
            >
              <span className="text-[13px] font-medium">{item.label}</span>
              <span className="text-[12px] text-muted-foreground">
                {item.summary}
              </span>
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}
