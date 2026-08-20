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
import { BannerWash } from "@/components/spaces/BannerWash";
import {
  getWorkConnectorsServerSnapshot,
  getWorkConnectorsSnapshot,
  subscribeWorkConnectors,
  workConnectorIds,
} from "@/lib/work-connectors";
import {
  workEmptyCopy,
  workItemsFor,
  workScopeOptions,
  workSectionTitle,
  type WorkItem,
  type WorkScope,
  type WorkTone,
} from "@/lib/work-catalog";
import { cn } from "@/lib/utils";

export function WorkDashboard() {
  const { workspaceId, newChat, sendMessage, spaceLayout, setSpaceLayout } =
    useApp();
  const [scope, setScope] = useState<WorkScope>("today");
  useSyncExternalStore(
    subscribeWorkConnectors,
    getWorkConnectorsSnapshot,
    getWorkConnectorsServerSnapshot,
  );
  const attachedIds = workConnectorIds(workspaceId);
  const items = useMemo(
    () => workItemsFor(workspaceId, scope, attachedIds),
    [workspaceId, scope, attachedIds],
  );

  const ask = (text: string) => {
    newChat("work");
    sendMessage(text, { space: "work" });
  };

  return (
    <DashFrame
      space="work"
      title="Work"
      subtitle="Keep up and act on what needs you."
      actions={
        <>
          <DashBtn primary onClick={() => newChat("work")}>
            New work
          </DashBtn>
          <SpaceSettingsButton space="work" />
        </>
      }
    >
      <div className="flex flex-col gap-3 @min-[420px]:flex-row @min-[420px]:flex-wrap @min-[420px]:items-center @min-[420px]:justify-between">
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as WorkScope)}
          options={workScopeOptions()}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <section className="mt-8">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          {workSectionTitle(scope)}
        </h2>
        {spaceLayout === "cards" ? (
          <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-5 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
            {items.length ? (
              items.map((item) => (
                <WorkCard key={item.id} item={item} onAsk={ask} />
              ))
            ) : (
              <p className="col-span-full px-1 py-4 text-[13px] text-muted-foreground">
                {workEmptyCopy(scope)}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
            {items.length ? (
              items.map((item) => (
                <WorkRow key={item.id} item={item} onAsk={ask} />
              ))
            ) : (
              <p className="px-4 py-6 text-[13px] text-muted-foreground">
                {workEmptyCopy(scope)}
              </p>
            )}
          </div>
        )}
      </section>

      {scope === "approvals" && items.length ? (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Approvals open in chat so Courier can check policy, draft a note, and
          log the decision.
        </p>
      ) : null}
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
      className="min-w-0 text-left"
    >
      <div className="relative aspect-[16/9] overflow-hidden rounded-[10px]">
        <BannerWash space="work" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
          <span className="flex flex-wrap items-center gap-2">
            <ToneDot tone={item.tone} light />
            {item.badge ? (
              <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                {item.badge}
              </span>
            ) : null}
          </span>
          <p className="mt-2 line-clamp-2 text-[14px] font-medium tracking-[-0.02em]">
            {item.title}
          </p>
        </div>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
        {item.summary}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">{item.meta}</p>
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
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 first:rounded-t-[10px] last:rounded-b-[10px] hover:bg-muted/60"
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
