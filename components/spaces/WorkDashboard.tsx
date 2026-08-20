"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { WorkConnectorsChip } from "@/components/spaces/WorkConnectorsChip";
import { StatsBanner } from "@/components/spaces/StatsBanner";
import { spaceStats } from "@/lib/data";
import {
  getWorkConnectorsServerSnapshot,
  getWorkConnectorsSnapshot,
  subscribeWorkConnectors,
  workConnectorIds,
} from "@/lib/work-connectors";
import {
  workBriefActions,
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
  const { workspaceId, newChat, sendMessage, armChatInterface } = useApp();
  const [scope, setScope] = useState<WorkScope>("today");
  useSyncExternalStore(
    subscribeWorkConnectors,
    getWorkConnectorsSnapshot,
    getWorkConnectorsServerSnapshot,
  );
  const attachedIds = workConnectorIds(workspaceId);
  const meta = spaceStats.work;
  const items = useMemo(
    () => workItemsFor(workspaceId, scope, attachedIds),
    [workspaceId, scope, attachedIds],
  );

  const ask = (text: string) => {
    newChat("work");
    armChatInterface("work");
    sendMessage(text, { space: "work" });
  };

  return (
    <DashFrame
      space="work"
      kicker={meta.kicker}
      title="Work"
      subtitle="Keep up and act — replies, meetings, customers, follow-ups, and approvals."
      actions={
        <>
          <SpaceSettingsButton space="work" />
          <DashBtn primary onClick={() => newChat("work")}>
            New work
          </DashBtn>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as WorkScope)}
          options={workScopeOptions()}
        />
        <WorkConnectorsChip />
      </div>

      <StatsBanner stats={meta.stats} />

      {scope === "today" ? (
        <section className="mt-6">
          <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
            Quick actions
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {workBriefActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => ask(action.prompt)}
                className="inline-flex h-9 items-center rounded-full border border-border bg-transparent px-3.5 text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          {workSectionTitle(scope)}
        </h2>
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

function ToneDot({ tone }: { tone?: WorkTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
        tone === "urgent" && "bg-rose-500",
        tone === "waiting" && "bg-amber-500",
        tone === "ready" && "bg-sky-500",
        (!tone || tone === "neutral") && "bg-muted-foreground/35",
      )}
    />
  );
}
