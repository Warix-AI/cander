"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { DashBtn } from "@/components/spaces/ItemSet";
import { Dropdown } from "@/components/ui/Controls";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import type { ProjectKind } from "@/lib/space-entities";

export const BUILD_CREATE_OPTIONS: {
  kind: ProjectKind;
  label: string;
  summary: string;
}[] = [
  { kind: "app", label: "App", summary: "Interactive app or tool" },
  { kind: "site", label: "Website", summary: "Marketing site or landing page" },
  {
    kind: "automation",
    label: "Automation",
    summary: "Scheduled or triggered workflow",
  },
];

const buildKinds = BUILD_CREATE_OPTIONS;

type NewBuildMenuProps = {
  onCreated: (projectId: string) => void;
  /** Icon-only plus trigger (toolbar). */
  icon?: boolean;
};

export function NewBuildMenu({ onCreated, icon = false }: NewBuildMenuProps) {
  const ctx = useWorkspaceCtx();
  const { createProject } = useSpaceMutation();
  const [busy, setBusy] = useState(false);

  const start = async (kind: ProjectKind, label: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const project = await createProject(ctx, {
        space: "build",
        title: `New ${label}`,
        kind,
        summary: buildKinds.find((item) => item.kind === kind)?.summary ?? "",
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
      trigger={({ open, toggle }) =>
        icon ? (
          <DashBtn primary icon onClick={toggle} label="New build">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
          </DashBtn>
        ) : (
          <DashBtn primary onClick={toggle} label="New build">
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
          {buildKinds.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                close();
                void start(item.kind, item.label);
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
