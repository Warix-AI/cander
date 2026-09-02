"use client";

import { Plus } from "lucide-react";
import { DashBtn } from "@/components/spaces/ItemSet";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import type { ProjectKind } from "@/lib/space-entities";

export type StudioStart = {
  id: "project";
  label: string;
  summary: string;
  kind: ProjectKind;
  title: string;
};

/** Studio projects are creative canvases with optional browser tabs. */
export const STUDIO_CREATE_OPTIONS: StudioStart[] = [
  {
    id: "project",
    label: "New project",
    summary: "Create",
    kind: "general",
    title: "Studio project",
  },
];

type NewStudioMenuProps = {
  onCreated: (projectId: string) => void;
};

export function NewStudioMenu({ onCreated }: NewStudioMenuProps) {
  const { openCreate, busy, modal } = useCreateProjectFlow(onCreated);
  const item = STUDIO_CREATE_OPTIONS[0]!;

  return (
    <>
      <DashBtn
        primary
        icon
        label="New in Studio"
        onClick={() => {
          if (busy) return;
          openCreate({
            space: "studio",
            kind: item.kind,
            defaultTitle: item.title,
            summary: item.summary,
          });
        }}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
      </DashBtn>
      {modal}
    </>
  );
}
