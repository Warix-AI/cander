"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  DashToolbar,
  LayoutToggle,
  useSpaceChatClosed,
} from "@/components/spaces/ItemSet";
import { workEmptyCopy, type WorkTone } from "@/lib/work-catalog";
import type { BriefingItem } from "@/lib/space-entities";
import { useSpaceBriefingItems } from "@/lib/hooks/use-space-query";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function WorkDashboard() {
  const {
    workspaceId,
    openSpace,
    openSpaceChat,
    openSpaceEntity,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
  } = useApp();
  const mobile = useMobileShell();
  const chatClosed = useSpaceChatClosed();
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
      banner={false}
      title="Work"
      subtitle="Use and organize what you build and connect."
    >
      <DashToolbar
        active={hoistFilters}
        onNewChat={chatClosed ? () => openSpaceChat("work") : undefined}
        newChatLabel="Ask"
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
        extras={[
          {
            id: "connectors",
            label: "Connectors",
            onClick: () => openSpace("connectors"),
          },
        ]}
        actions={
          <>
            {chatClosed ? (
              <DashBtn primary onClick={() => openSpaceChat("work")}>
                Ask
              </DashBtn>
            ) : null}
            <DashBtn onClick={() => openSpace("connectors")}>Connectors</DashBtn>
          </>
        }
      >
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </DashToolbar>

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
      className="flex h-full min-w-0 flex-col rounded-[10px] border border-border p-4 text-left transition-colors duration-200 hover:bg-muted/30 dark:hover:bg-muted/20"
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
      className="flex w-full items-center gap-3 py-3.5 text-left transition-colors duration-200 hover:bg-muted/40 dark:hover:bg-muted/30 first:rounded-t-[10px] last:rounded-b-[10px]"
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

