"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { connectorName } from "@/lib/api/connector-api";
import {
  useConnectedConnectors,
  useSpaceAttachments,
  useSpaceBriefingItems,
  useSpaceProjects,
} from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import type { BriefingItem } from "@/lib/space-entities";
import {
  workEmptyCopy,
  workScopeOptions,
  workSectionTitle,
  type WorkScope,
  type WorkTone,
} from "@/lib/work-catalog";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function WorkDashboard() {
  const {
    workspaceId,
    newChat,
    openJob,
    openSpaceEntity,
    openProject,
    openConnector,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
    openSpace,
    openSpaceSettings,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";
  const [scope, setScope] = useState<WorkScope>("today");

  const { data: briefingItems, loading: briefingLoading } =
    useSpaceBriefingItems();
  const { connectorIds } = useConnectedConnectors();
  const { data: attachments } = useSpaceAttachments();
  const { data: buildProjects } = useSpaceProjects("build");

  const buildNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of buildProjects) map[item.id] = item.title;
    return map;
  }, [buildProjects]);

  const todayItems = useMemo(
    () =>
      briefingItems.filter((item) => item.workspaceId === workspaceId),
    [briefingItems, workspaceId],
  );

  const appItems = useMemo(() => {
    const items: {
      id: string;
      title: string;
      summary: string;
      meta: string;
      badge?: string;
      tone?: WorkTone;
      kind: "connector" | "build";
      targetId: string;
    }[] = [];
    for (const id of connectorIds) {
      items.push({
        id: `app-connector-${id}`,
        title: connectorName(id),
        summary: "Connected app available in Work.",
        meta: "Connector · attached",
        badge: "App",
        tone: "ready",
        kind: "connector",
        targetId: id,
      });
    }
    for (const item of attachments) {
      items.push({
        id: `app-build-${item.targetId}`,
        title: buildNames[item.targetId] ?? item.label ?? item.targetId,
        summary: "Built in Build and added to Work.",
        meta: "Build · in Work",
        badge: "App",
        tone: "neutral",
        kind: "build",
        targetId: item.targetId,
      });
    }
    return items;
  }, [connectorIds, attachments, buildNames]);

  const { data: automations } = useSpaceProjects("build", {
    kind: "automation",
  });

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

  const openApp = (kind: "connector" | "build", targetId: string) => {
    if (kind === "connector") openConnector(targetId);
    else openProject(targetId);
  };

  return (
    <DashFrame
      space="work"
      title="Work"
      subtitle="Run your work from one place."
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
            id: "add-connector",
            label: "Add connector",
            onClick: () => {
              openSpace("connectors");
            },
          },
          {
            id: "manage-connectors",
            label: "Manage connectors",
            onClick: () => openSpaceSettings("work", { tab: "connectors" }),
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
                meta: "Automation",
                detail: "Scheduled",
                badge: "Automation",
              }))}
              onOpen={(id) => openJob(id)}
              empty={workEmptyCopy("automations")}
            />
          </div>
        ) : scope === "apps" ? (
          !appItems.length ? (
            <p className="mt-3 px-3 py-4 text-[13px] text-muted-foreground">
              {workEmptyCopy("apps")}
            </p>
          ) : spaceLayout === "cards" ? (
            <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-5 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
              {appItems.map((item) => (
                <WorkAppCard
                  key={item.id}
                  item={item}
                  onOpen={() => openApp(item.kind, item.targetId)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
              {appItems.map((item) => (
                <WorkAppRow
                  key={item.id}
                  item={item}
                  onOpen={() => openApp(item.kind, item.targetId)}
                />
              ))}
            </div>
          )
        ) : briefingLoading ? (
          <QuerySkeleton rows={3} />
        ) : !todayItems.length ? (
          <p className="mt-3 px-3 py-4 text-[13px] text-muted-foreground">
            {workEmptyCopy("today")}
          </p>
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

function WorkAppCard({
  item,
  onOpen,
}: {
  item: {
    title: string;
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
      <ToneDot tone={item.tone} />
      {item.badge ? (
        <span className="mt-2 inline-flex w-fit rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {item.badge}
        </span>
      ) : null}
      <p className="mt-2 text-[14px] font-medium tracking-[-0.02em]">
        {item.title}
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">{item.summary}</p>
      <p className="mt-2 text-[12px] text-muted-foreground">{item.meta}</p>
    </button>
  );
}

function WorkAppRow({
  item,
  onOpen,
}: {
  item: {
    title: string;
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
      <ToneDot tone={item.tone} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium tracking-[-0.02em]">
            {item.title}
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
