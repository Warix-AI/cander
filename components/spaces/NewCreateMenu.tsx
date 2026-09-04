"use client";

import { ChevronDown, Plus } from "lucide-react";
import { DashBtn } from "@/components/spaces/ItemSet";
import { BUILD_CREATE_OPTIONS } from "@/components/spaces/NewBuildMenu";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { Dropdown } from "@/components/ui/Controls";
import type { ProjectKind } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

export type CreateStart = {
  id: string;
  label: string;
  summary: string;
  kind: ProjectKind;
  space: SpaceId;
  title: string;
};

/** Unified Create menu — Image (Studio) + App / Website / Automation (Build). */
export const CREATE_MENU_OPTIONS: CreateStart[] = [
  {
    id: "image",
    label: "Image",
    summary: "Generate and edit images",
    kind: "general",
    space: "studio",
    title: "Image project",
  },
  ...BUILD_CREATE_OPTIONS.map((item) => ({
    id: item.kind,
    label: item.label,
    summary: item.summary,
    kind: item.kind,
    space: "build" as const,
    title: `New ${item.label}`,
  })),
];

type NewCreateMenuProps = {
  onCreated: (projectId: string) => void;
  /** Icon-only plus trigger (toolbar). */
  icon?: boolean;
};

export function NewCreateMenu({ onCreated, icon = true }: NewCreateMenuProps) {
  const { openCreate, busy, modal } = useCreateProjectFlow(onCreated);

  return (
    <>
      <Dropdown
        align="end"
        matchTrigger={false}
        menuClassName="min-w-[12rem]"
        trigger={({ open, toggle }) =>
          icon ? (
            <DashBtn primary icon onClick={toggle} label="New in Create">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
            </DashBtn>
          ) : (
            <DashBtn primary onClick={toggle} label="New in Create">
              New
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                strokeWidth={1.8}
              />
            </DashBtn>
          )
        }
      >
        {(close) => (
          <>
            {CREATE_MENU_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  close();
                  openCreate({
                    space: item.space,
                    kind: item.kind,
                    defaultTitle: item.title,
                    summary: item.summary,
                  });
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
      {modal}
    </>
  );
}
