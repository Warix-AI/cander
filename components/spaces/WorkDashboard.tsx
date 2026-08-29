"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { workEmptyCopy, type WorkTone } from "@/lib/work-catalog";
import type { BriefingItem } from "@/lib/space-entities";
import { useSpaceBriefingItems } from "@/lib/hooks/use-space-query";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function WorkDashboard() {
  const {
    workspaceId,
    newChat,
    openSpaceEntity,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
    openSpaceSettings,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";

  const { data: briefingItems, loading: briefingLoading } =
    useSpaceBriefingItems();

  const todayItems = useMemo(
    () =>
      briefingItems.filter((item) => item.workspaceId === workspaceId),
    [briefingItems, workspaceId],
  );

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
        newChatLabel="Ask"
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
        extras={[
          {
            id: "manage-work",
            label: "Work settings",
            onClick: () => openSpaceSettings("work"),
          },
        ]}
      >
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </MobileFilterBar>

      <section className="mt-5 lg:mt-5">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          Today
        </h2>

        {briefingLoading || !todayItems.length ? (
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

