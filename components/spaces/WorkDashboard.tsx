"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { connectors as connectorCatalog } from "@/lib/data";
import { editedMeta } from "@/lib/format-relative-time";
import {
  useConnectedConnectors,
  useSpaceAttachments,
  useSpaceBriefingItems,
  useSpaceProjects,
} from "@/lib/hooks/use-space-query";
import {
  WORK_FEATURED_CONNECTOR_IDS,
  workEmptyCopy,
  workScopeOptions,
  workSectionTitle,
  type WorkScope,
  type WorkTone,
} from "@/lib/work-catalog";
import type { BriefingItem } from "@/lib/space-entities";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  connectionsForConnector,
  getWorkspaceConnectionsServerSnapshot,
  getWorkspaceConnectionsSnapshot,
  subscribeWorkspaceConnections,
} from "@/lib/workspace-connections";

export function WorkDashboard() {
  const {
    workspaceId,
    workspace,
    newChat,
    openProject,
    openSpaceEntity,
    openConnector,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
    openSpaceSettings,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";
  const [scope, setScope] = useState<WorkScope>("today");
  useSyncExternalStore(
    subscribeWorkspaceConnections,
    getWorkspaceConnectionsSnapshot,
    getWorkspaceConnectionsServerSnapshot,
  );

  const { data: briefingItems, loading: briefingLoading } =
    useSpaceBriefingItems();
  const { connectorIds } = useConnectedConnectors();
  const { data: attachments } = useSpaceAttachments();
  const { data: buildProjects } = useSpaceProjects("build");
  const { data: automations } = useSpaceProjects("build", {
    kind: "automation",
  });

  const buildById = useMemo(() => {
    const map = new Map(buildProjects.map((item) => [item.id, item]));
    return map;
  }, [buildProjects]);

  const todayItems = useMemo(
    () =>
      briefingItems.filter((item) => item.workspaceId === workspaceId),
    [briefingItems, workspaceId],
  );

  const appItems = useMemo(() => {
    const seen = new Set<string>();
    const items: {
      id: string;
      name: string;
      projectId: string;
      meta: string;
      badge?: string;
      image?: string;
    }[] = [];

    for (const item of attachments) {
      if (seen.has(item.targetId)) continue;
      seen.add(item.targetId);
      const project = buildById.get(item.targetId);
      items.push({
        id: item.targetId,
        name: project?.title ?? item.label ?? item.targetId,
        projectId: item.targetId,
        meta: project
          ? `${project.kind === "site" ? "Website" : project.kind === "app" ? "App" : "Project"} · ${editedMeta(project.updatedAt)}`
          : "Build · in Work",
        badge:
          project?.status === "published"
            ? "Published"
            : project?.kind === "site"
              ? "Website"
              : "App",
        image: project?.cover,
      });
    }

    for (const project of buildProjects) {
      if (project.kind === "automation") continue;
      if (project.status !== "published") continue;
      if (seen.has(project.id)) continue;
      seen.add(project.id);
      items.push({
        id: project.id,
        name: project.title,
        projectId: project.id,
        meta: `${project.kind === "site" ? "Website" : "App"} · ${editedMeta(project.updatedAt)}`,
        badge: "Published",
        image: project.cover,
      });
    }

    return items;
  }, [attachments, buildById, buildProjects]);

  const connectorItems = useMemo(() => {
    const ids =
      connectorIds.length > 0
        ? connectorIds
        : [...WORK_FEATURED_CONNECTOR_IDS];
    return ids.map((id) => {
      const catalog = connectorCatalog.find((item) => item.id === id);
      const accounts = connectionsForConnector(
        workspaceId,
        id,
        workspace,
      );
      const attached = connectorIds.includes(id);
      const status =
        accounts[0]?.status === "needs-reauth"
          ? "Needs reauth"
          : accounts.length
            ? "Connected"
            : attached
              ? "Attached"
              : "Available";
      return {
        id,
        name: catalog?.name ?? id,
        icon: catalog?.icon ?? id,
        summary: catalog?.description ?? "Connected service for Work.",
        meta: status,
        badge: attached || accounts.length ? "Connected" : "Available",
        tone: (accounts[0]?.status === "needs-reauth"
          ? "waiting"
          : attached || accounts.length
            ? "ready"
            : "neutral") as WorkTone,
      };
    });
  }, [connectorIds, workspace, workspaceId]);

  const openBriefing = (item: BriefingItem) => {
    openSpaceEntity({
      type: "briefing",
      id: item.id,
      space: "work",
      workspaceId: item.workspaceId,
      label: item.title,
      snapshot: item.prompt,
    });
  };

  return (
    <DashFrame
      space="work"
      title="Work"
      subtitle="Use and organize what you build and connect."
      actions={
        <>
          <DashBtn primary onClick={() => newChat("work")}>
            Ask
          </DashBtn>
          <SpaceSettingsButton space="work" />
        </>
      }
    >
      <MobileFilterBar
        active={hoistFilters}
        onNewChat={() => newChat("work")}
        scope={{
          value: scope,
          onChange: (value) => setScope(value as WorkScope),
          options: workScopeOptions(),
        }}
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
        extras={[
          {
            id: "manage-work",
            label: "Work settings",
            onClick: () => openSpaceSettings("work"),
          },
        ]}
      >
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as WorkScope)}
          options={workScopeOptions()}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </MobileFilterBar>

      <section className="mt-5 lg:mt-5">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          {workSectionTitle(scope)}
        </h2>

        {scope === "automations" ? (
          <div className="mt-3">
            <PreviewGrid
              layout={spaceLayout}
              kind="schedule"
              items={automations.map((item) => ({
                id: item.id,
                name: item.title,
                projectId: item.id,
                meta:
                  item.status === "published"
                    ? "Active · Published"
                    : "Draft · Build",
                detail: editedMeta(item.updatedAt),
                badge: item.status === "published" ? "Active" : "Paused",
              }))}
              onOpen={(id) => openProject(id)}
              empty={workEmptyCopy("automations")}
            />
          </div>
        ) : scope === "apps" ? (
          <div className="mt-3">
            <PreviewGrid
              layout={spaceLayout}
              items={appItems}
              onOpen={openProject}
              empty={workEmptyCopy("apps")}
            />
          </div>
        ) : scope === "connectors" ? (
          !connectorItems.length ? (
            <p className="mt-3 px-3 py-2 text-[13px] text-muted-foreground">
              {workEmptyCopy("connectors")}
            </p>
          ) : spaceLayout === "cards" ? (
            <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-5 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
              {connectorItems.map((item) => (
                <WorkConnectorCard
                  key={item.id}
                  item={item}
                  onOpen={() => openConnector(item.id)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
              {connectorItems.map((item) => (
                <WorkConnectorRow
                  key={item.id}
                  item={item}
                  onOpen={() => openConnector(item.id)}
                />
              ))}
            </div>
          )
        ) : briefingLoading || !todayItems.length ? (
          <div className="mt-3">
            <WorkDayOverview />
            {!briefingLoading ? (
              <p className="mt-4 px-1 text-[13px] leading-relaxed text-muted-foreground">
                {workEmptyCopy("today")}
              </p>
            ) : null}
          </div>
        ) : spaceLayout === "cards" ? (
          <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-5 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
            {todayItems.map((item) => (
              <BriefingCard
                key={item.id}
                item={item}
                onOpen={() => openBriefing(item)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
            {todayItems.map((item) => (
              <BriefingRow
                key={item.id}
                item={item}
                onOpen={() => openBriefing(item)}
              />
            ))}
          </div>
        )}
      </section>
    </DashFrame>
  );
}

function WorkDayOverview() {
  const lanes = [
    { title: "Tasks", detail: "Replies, approvals, and follow-ups" },
    { title: "Activity", detail: "What moved since you last looked" },
    { title: "Alerts", detail: "Items that need attention today" },
  ];
  return (
    <div className="grid gap-2">
      {lanes.map((lane) => (
        <div
          key={lane.title}
          className="rounded-[10px] border border-border bg-muted/30 px-4 py-3.5"
        >
          <p className="text-[14px] font-medium tracking-[-0.02em]">{lane.title}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{lane.detail}</p>
        </div>
      ))}
    </div>
  );
}

function BriefingCard({
  item,
  onOpen,
}: {
  item: BriefingItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-w-0 flex-col rounded-[10px] border border-border p-4 text-left canvas-hover"
    >
      <ToneDot tone={item.tone} />
      <p className="mt-2 line-clamp-2 text-[14px] font-medium tracking-[-0.02em]">
        {item.title}
      </p>
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
        {item.summary}
      </p>
    </button>
  );
}

function BriefingRow({
  item,
  onOpen,
}: {
  item: BriefingItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="canvas-hover flex w-full items-center gap-3 py-3.5 text-left transition-colors duration-200 first:rounded-t-[10px] last:rounded-b-[10px]"
    >
      <ToneDot tone={item.tone} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium tracking-[-0.02em]">
          {item.title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
          {item.summary}
        </span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        strokeWidth={1.6}
      />
    </button>
  );
}

function WorkConnectorCard({
  item,
  onOpen,
}: {
  item: {
    name: string;
    icon: string;
    summary: string;
    meta: string;
    badge?: string;
    tone?: WorkTone;
  };
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-w-0 flex-col rounded-[10px] border border-border p-4 text-left canvas-hover"
    >
      <div className="flex items-center gap-2">
        <ConnectorMark id={item.icon} size="sm" />
        <ToneDot tone={item.tone} />
      </div>
      {item.badge ? (
        <span className="mt-2 inline-flex w-fit rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {item.badge}
        </span>
      ) : null}
      <p className="mt-2 text-[14px] font-medium tracking-[-0.02em]">
        {item.name}
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
        {item.summary}
      </p>
      <p className="mt-2 text-[12px] text-muted-foreground">{item.meta}</p>
    </button>
  );
}

function WorkConnectorRow({
  item,
  onOpen,
}: {
  item: {
    name: string;
    icon: string;
    summary: string;
    meta: string;
    badge?: string;
    tone?: WorkTone;
  };
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="canvas-hover flex w-full items-center gap-3 py-3.5 text-left"
    >
      <ConnectorMark id={item.icon} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium tracking-[-0.02em]">
            {item.name}
          </span>
          {item.badge ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {item.badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
          {item.summary}
        </span>
      </span>
      <span className="shrink-0 text-[12px] text-muted-foreground">
        {item.meta}
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        strokeWidth={1.6}
      />
    </button>
  );
}

function ToneDot({
  tone,
}: {
  tone?: WorkTone | BriefingItem["tone"];
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        tone === "urgent" && "bg-rose-500",
        tone === "waiting" && "bg-amber-500",
        tone === "ready" && "bg-sky-500",
        (!tone || tone === "neutral") && "bg-muted-foreground/35",
      )}
    />
  );
}
