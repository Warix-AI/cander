"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
import { BannerWash } from "@/components/spaces/BannerWash";
import { connectors, buildPreviews } from "@/lib/data";
import { workspaceAutomations, taskMeta } from "@/lib/build-catalog";
import {
  getWorkConnectorsServerSnapshot,
  getWorkConnectorsSnapshot,
  subscribeWorkConnectors,
  workConnectorIds,
  armWorkConnectorAttach,
} from "@/lib/work-connectors";
import {
  getWorkAppsServerSnapshot,
  getWorkAppsSnapshot,
  subscribeWorkApps,
  workAppIds,
} from "@/lib/work-apps";
import {
  workAppsFor,
  workEmptyCopy,
  workItemsFor,
  workScopeOptions,
  workSectionTitle,
  type WorkItem,
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
    sendMessage,
    openJob,
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
  useSyncExternalStore(
    subscribeWorkConnectors,
    getWorkConnectorsSnapshot,
    getWorkConnectorsServerSnapshot,
  );
  useSyncExternalStore(
    subscribeWorkApps,
    getWorkAppsSnapshot,
    getWorkAppsServerSnapshot,
  );
  const attachedIds = workConnectorIds(workspaceId);
  const attachedBuildIds = workAppIds(workspaceId);

  const connectorNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of connectors) map[item.id] = item.name;
    return map;
  }, []);

  const buildNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of buildPreviews) {
      if (item.workspaceId === workspaceId) {
        map[item.projectId] = item.name;
      }
    }
    return map;
  }, [workspaceId]);

  const todayItems = useMemo(
    () => workItemsFor(workspaceId, "today", attachedIds),
    [workspaceId, attachedIds],
  );

  const appItems = useMemo(
    () =>
      workAppsFor(
        workspaceId,
        attachedIds,
        attachedBuildIds,
        connectorNames,
        buildNames,
      ),
    [
      workspaceId,
      attachedIds,
      attachedBuildIds,
      connectorNames,
      buildNames,
    ],
  );

  const automations = useMemo(
    () => workspaceAutomations(workspaceId),
    [workspaceId],
  );

  const ask = (text: string) => {
    newChat("work");
    sendMessage(text, { space: "work" });
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
              armWorkConnectorAttach(workspaceId);
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
                name: item.name,
                projectId: item.id,
                meta: taskMeta(item),
                detail: item.nextRun ?? item.schedule,
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
                <WorkCard key={item.id} item={item} onAsk={ask} />
              ))}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
              {appItems.map((item) => (
                <WorkRow key={item.id} item={item} onAsk={ask} />
              ))}
            </div>
          )
        ) : !todayItems.length ? (
          <p className="mt-3 px-3 py-4 text-[13px] text-muted-foreground">
            {workEmptyCopy("today")}
          </p>
        ) : spaceLayout === "cards" ? (
          <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-5 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
            {todayItems.map((item) => (
              <WorkCard key={item.id} item={item} onAsk={ask} />
            ))}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
            {todayItems.map((item) => (
              <WorkRow key={item.id} item={item} onAsk={ask} />
            ))}
          </div>
        )}
      </section>
    </DashFrame>
  );
}

function WorkCard({
  item,
  onAsk,
}: {
  item: WorkItem;
  onAsk: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAsk(item.prompt)}
      className="flex h-full min-w-0 flex-col text-left"
    >
      <p className="mb-2 truncate text-[12px] text-muted-foreground">
        {item.meta}
      </p>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[10px] max-lg:aspect-[16/11]">
        <BannerWash space="work" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3.5 pb-4 text-white">
          <span className="flex flex-wrap items-center gap-2">
            <ToneDot tone={item.tone} light />
            {item.badge ? (
              <span className="inline-flex items-center rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] leading-none font-medium text-foreground">
                {item.badge}
              </span>
            ) : null}
          </span>
          <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-[14px] font-medium tracking-[-0.02em]">
            {item.title}
          </p>
        </div>
      </div>
      <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-muted-foreground">
        {item.summary}
      </p>
    </button>
  );
}

function WorkRow({
  item,
  onAsk,
}: {
  item: WorkItem;
  onAsk: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAsk(item.prompt)}
      className="canvas-hover flex w-full items-center gap-3 py-3.5 text-left transition-colors duration-200 first:rounded-t-[10px] last:rounded-b-[10px]"
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
      <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:block">
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
  light = false,
}: {
  tone?: WorkTone;
  light?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
        light && "mt-0 ring-2 ring-white/40",
        tone === "urgent" && "bg-rose-500",
        tone === "waiting" && "bg-amber-500",
        tone === "ready" && "bg-sky-500",
        (!tone || tone === "neutral") &&
          (light ? "bg-white/70" : "bg-muted-foreground/35"),
      )}
    />
  );
}
