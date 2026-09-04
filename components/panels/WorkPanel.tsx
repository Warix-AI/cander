"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { Row } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import {
  useSpaceProjects,
} from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { SHELL_PANEL_BODY, SHELL_PANEL_SCROLL } from "@/lib/shell-chrome";
import type { SpaceId } from "@/lib/types";

type WorkPanelTab = "home" | "build" | "studio";

const TAB_SPACE: Record<WorkPanelTab, SpaceId> = {
  home: "research",
  build: "build",
  studio: "studio",
};

export function WorkPanel() {
  const { project, openProject } = useApp();
  const [tab, setTab] = useState<WorkPanelTab>("home");
  const space = TAB_SPACE[tab];
  const { data: projects, loading } = useSpaceProjects(space);

  const rows = useMemo(
    () =>
      projects.map((item) => ({
        id: item.id,
        title: item.title,
        meta:
          tab === "home"
            ? "Explore"
            : tab === "build"
              ? item.kind === "automation"
                ? "Create · Automation"
                : item.status === "published"
                  ? "Create · Published"
                  : "Create"
              : "Create",
      })),
    [projects, tab],
  );

  if (project && project.space !== "work") {
    return <SpaceLibraryPanel />;
  }

  const tabs = [
    { id: "home" as const, label: "Explore" },
    { id: "build" as const, label: "Create" },
    { id: "studio" as const, label: "Images" },
  ];

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome kicker="Work" title={project?.name ?? "Work"} />
      <div className="border-b border-border px-2 py-1.5">
        <SegTabs
          items={tabs}
          value={tab}
          onChange={(id) => setTab(id as WorkPanelTab)}
        />
      </div>
      <div className={SHELL_PANEL_SCROLL}>
        {loading ? (
          <QuerySkeleton />
        ) : rows.length ? (
          <div className="py-2">
            {rows.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openProject(item.id)}
                className="block w-full text-left"
              >
                <Row title={item.title} meta={item.meta} />
              </button>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-[13px] text-muted-foreground">
            {tab === "home"
              ? "No Home projects in Work yet."
              : tab === "build"
                ? "No Build projects in Work yet."
                : "No Studio projects in Work yet."}
          </p>
        )}
      </div>
    </div>
  );
}
