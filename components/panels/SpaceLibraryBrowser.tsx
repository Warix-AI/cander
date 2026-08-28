"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { LayoutToggle, ScopeToggle } from "@/components/spaces/ItemSet";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { PreviewGrid, type PreviewEntry } from "@/components/spaces/PreviewCard";
import { useSpaceProjects, useSpaceSources } from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { editedMeta } from "@/lib/format-relative-time";
import { spaceLibraryLabel, type SpaceLibraryId } from "@/lib/space-library";
import { useMobileShell } from "@/lib/use-media-query";
import { SHELL_PANEL_BODY } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type LibraryScope = "all" | "projects" | "sources";

export function SpaceLibraryBrowser({
  space,
  onOpen,
}: {
  space: SpaceLibraryId;
  onOpen: (id: string, kind: "project" | "source") => void;
}) {
  const mobile = useMobileShell();
  const { spaceLayout, setSpaceLayout } = useApp();
  const [scope, setScope] = useState<LibraryScope>("all");
  const { data: projects, loading: projectsLoading } = useSpaceProjects(space);
  const { data: sources, loading: sourcesLoading } = useSpaceSources({
    space,
  });

  const loading = projectsLoading || sourcesLoading;

  const entries = useMemo(() => {
    const projectItems: PreviewEntry[] = projects.map((item) => ({
      id: item.id,
      name: item.title,
      projectId: item.id,
      meta: editedMeta(item.updatedAt),
      image: item.cover,
      badge: item.status === "published" ? "Published" : undefined,
    }));
    const sourceItems: PreviewEntry[] = sources.map((item) => ({
      id: item.id,
      name: item.title,
      projectId: item.id,
      meta: `${item.kind} · ${item.url?.replace(/^https?:\/\//, "") ?? "saved"}`,
      kind: "file",
      detail: item.kind,
    }));
    if (scope === "projects") return projectItems;
    if (scope === "sources") return sourceItems;
    return [...projectItems, ...sourceItems];
  }, [projects, sources, scope]);

  return (
    <div className={SHELL_PANEL_BODY}>
      {mobile ? null : (
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.02em]">
            {spaceLibraryLabel(space)}
          </p>
          <PanelToggle />
        </div>
      )}
      <div
        className={cn(
          "flex items-center justify-between gap-2 pb-3",
          mobile ? "px-4 pt-3" : "px-3",
        )}
      >
        <ScopeToggle
          compact
          value={scope}
          onChange={(value) => setScope(value as LibraryScope)}
          options={[
            { id: "all", label: "All" },
            { id: "projects", label: "Projects" },
            { id: "sources", label: "Sources" },
          ]}
        />
        <LayoutToggle compact layout={spaceLayout} onChange={setSpaceLayout} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4", mobile ? "px-4" : "px-3")}>
        {loading ? (
          <QuerySkeleton rows={4} />
        ) : (
          <PreviewGrid
            dense
            layout={spaceLayout}
            items={entries}
            onOpen={(id) => {
              const source = sources.find((item) => item.id === id);
              onOpen(id, source ? "source" : "project");
            }}
            empty="Nothing in this library yet."
          />
        )}
      </div>
    </div>
  );
}
