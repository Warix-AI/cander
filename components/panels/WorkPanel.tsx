"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { Row } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import { connectorName } from "@/lib/api/connector-api";
import {
  useConnectedConnectors,
  useSpaceAttachments,
  useSpaceBriefingItems,
  useSpaceProjects,
  useSpaceSources,
} from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { SHELL_PANEL_BODY, SHELL_PANEL_SCROLL } from "@/lib/shell-chrome";

type WorkPanelTab = "briefing" | "apps" | "automations" | "library";

export function WorkPanel() {
  const {
    project,
    openProject,
    openConnector,
    openSpaceEntity,
  } = useApp();
  const [tab, setTab] = useState<WorkPanelTab>("briefing");
  const { data: briefing, loading: briefingLoading } = useSpaceBriefingItems();
  const { connectorIds } = useConnectedConnectors();
  const { data: attachments } = useSpaceAttachments();
  const { data: automations } = useSpaceProjects("build", {
    kind: "automation",
  });
  const { data: librarySources, loading: libraryLoading } = useSpaceSources();

  if (project && project.space !== "work") {
    return <SpaceLibraryPanel />;
  }

  const tabs = [
    { id: "briefing" as const, label: "Briefing" },
    { id: "apps" as const, label: "Apps" },
    { id: "automations" as const, label: "Automations" },
    { id: "library" as const, label: "Library" },
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
        {tab === "briefing" ? (
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
            {connectorIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => openConnector(id)}
                className="block w-full text-left"
              >
                <Row title={connectorName(id)} meta="Connector · attached" />
              </button>
            ))}
            {attachments.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openProject(item.targetId)}
                className="block w-full text-left"
              >
                <Row
                  title={item.label ?? item.targetId}
                  meta="Build · in Work"
                />
              </button>
            ))}
            {!connectorIds.length && !attachments.length ? (
              <p className="px-4 py-6 text-[13px] text-muted-foreground">
                No apps in Work yet. Attach connectors or add builds from Build.
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
                <Row title={item.title} meta="Automation" />
              </button>
            ))}
            {!automations.length ? (
              <p className="px-4 py-6 text-[13px] text-muted-foreground">
                No automations running yet.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "library" ? (
          libraryLoading ? (
            <QuerySkeleton />
          ) : librarySources.length ? (
            <div className="py-2">
              {librarySources.map((source) => (
                <Row
                  key={source.id}
                  title={source.title}
                  meta={source.kind}
                />
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
              Saved sources from Explore appear here.
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
