"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { Row } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import { connectors as connectorCatalog } from "@/lib/data";
import { connectorName } from "@/lib/api/connector-api";
import {
  useConnectedConnectors,
  useSpaceAttachments,
  useSpaceBriefingItems,
  useSpaceProjects,
} from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { WORK_FEATURED_CONNECTOR_IDS } from "@/lib/work-catalog";
import { SHELL_PANEL_BODY, SHELL_PANEL_SCROLL } from "@/lib/shell-chrome";

type WorkPanelTab = "today" | "apps" | "automations" | "connectors";

export function WorkPanel() {
  const {
    project,
    openProject,
    openConnector,
    openSpaceEntity,
  } = useApp();
  const [tab, setTab] = useState<WorkPanelTab>("today");
  const { data: briefing, loading: briefingLoading } = useSpaceBriefingItems();
  const { connectorIds } = useConnectedConnectors();
  const { data: attachments } = useSpaceAttachments();
  const { data: buildProjects } = useSpaceProjects("build");
  const { data: automations } = useSpaceProjects("build", {
    kind: "automation",
  });

  const publishedApps = useMemo(() => {
    const seen = new Set(attachments.map((item) => item.targetId));
    const fromAttach = attachments.map((item) => {
      const match = buildProjects.find((project) => project.id === item.targetId);
      return {
        id: item.targetId,
        title: match?.title ?? item.label ?? item.targetId,
        meta: "Build · in Work",
      };
    });
    const fromPublished = buildProjects
      .filter(
        (item) =>
          item.kind !== "automation" &&
          item.status === "published" &&
          !seen.has(item.id),
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        meta: "Published",
      }));
    return [...fromAttach, ...fromPublished];
  }, [attachments, buildProjects]);

  if (project && project.space !== "work") {
    return <SpaceLibraryPanel />;
  }

  const panelConnectors =
    connectorIds.length > 0
      ? connectorIds
      : [...WORK_FEATURED_CONNECTOR_IDS];

  const tabs = [
    { id: "today" as const, label: "Today" },
    { id: "apps" as const, label: "Apps" },
    { id: "automations" as const, label: "Automations" },
    { id: "connectors" as const, label: "Connectors" },
  ];

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome kicker="Work" title={project?.name ?? "Today"} />
      <div className="border-b border-border px-2 py-1.5">
        <SegTabs
          items={tabs}
          value={tab}
          onChange={(id) => setTab(id as WorkPanelTab)}
        />
      </div>
      <div className={SHELL_PANEL_SCROLL}>
        {tab === "today" ? (
          briefingLoading ? (
            <QuerySkeleton />
          ) : briefing.length ? (
            <div className="py-2">
              {briefing.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    openSpaceEntity({
                      type: "briefing",
                      id: item.id,
                      space: "work",
                      workspaceId: item.workspaceId,
                      label: item.title,
                      snapshot: item.prompt,
                    })
                  }
                  className="flex w-full px-4 py-3 text-left hover:bg-muted/50"
                >
                  <Row title={item.title} meta={item.summary} />
                </button>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
              Nothing on today yet.
            </p>
          )
        ) : null}

        {tab === "apps" ? (
          <div className="py-2">
            {publishedApps.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openProject(item.id)}
                className="block w-full text-left"
              >
                <Row title={item.title} meta={item.meta} />
              </button>
            ))}
            {!publishedApps.length ? (
              <p className="px-4 py-6 text-[13px] text-muted-foreground">
                No apps in Work yet. Publish from Build and add them here.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "automations" ? (
          <div className="py-2">
            {automations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openProject(item.id)}
                className="block w-full text-left"
              >
                <Row
                  title={item.title}
                  meta={
                    item.status === "published" ? "Active" : "Draft · Build"
                  }
                />
              </button>
            ))}
            {!automations.length ? (
              <p className="px-4 py-6 text-[13px] text-muted-foreground">
                No automations running yet.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "connectors" ? (
          <div className="py-2">
            {panelConnectors.map((id) => {
              const catalog = connectorCatalog.find((item) => item.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openConnector(id)}
                  className="block w-full text-left"
                >
                  <Row
                    title={catalog?.name ?? connectorName(id)}
                    meta={
                      connectorIds.includes(id) ? "Connected" : "Available"
                    }
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
