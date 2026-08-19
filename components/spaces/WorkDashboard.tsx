"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { StatsBanner } from "@/components/spaces/StatsBanner";
import { projects, spaceStats } from "@/lib/data";
import type { Project } from "@/lib/types";

type WorkScope = "all" | "inbox" | "calendar" | "customers";

const workKind: Record<string, Exclude<WorkScope, "all">> = {
  "today-inbox": "inbox",
  "vendor-followup": "inbox",
  "launch-sync": "calendar",
  "eng-standup": "calendar",
  "acme-renewal": "customers",
};

export function WorkDashboard() {
  const { workspaceId, newChat, sendMessage, armChatInterface } = useApp();
  const [scope, setScope] = useState<WorkScope>("all");
  const meta = spaceStats.work;

  const items = projects.filter(
    (item) => item.space === "work" && item.workspaceId === workspaceId,
  );
  const visible =
    scope === "all"
      ? items
      : items.filter((item) => workKind[item.id] === scope);

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
      subtitle="Inbox, calendar, and customers — the day, not another product."
      actions={
        <>
          <SpaceSettingsButton space="work" />
          <DashBtn primary onClick={() => newChat("work")}>
            New work
          </DashBtn>
        </>
      }
    >
      <div>
        <ScopeToggle
          value={scope}
          onChange={(value) => setScope(value as WorkScope)}
          options={[
            { id: "all", label: "All" },
            { id: "inbox", label: "Inbox" },
            { id: "calendar", label: "Calendar" },
            { id: "customers", label: "Customers" },
          ]}
        />
      </div>

      <StatsBanner stats={meta.stats} />

      <section className="mt-8">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          Open
        </h2>
        <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
          {visible.length ? (
            visible.map((item) => (
              <WorkRow key={item.id} item={item} onAsk={ask} />
            ))
          ) : (
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
              Nothing open in this view. Ask Courier to prep a meeting, draft a
              reply, or check on a customer.
            </p>
          )}
        </div>
      </section>
    </DashFrame>
  );
}

function WorkRow({
  item,
  onAsk,
}: {
  item: Project;
  onAsk: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAsk(`Help me with ${item.name.toLowerCase()}.`)}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 first:rounded-t-[10px] last:rounded-b-[10px] hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium tracking-[-0.02em]">
          {item.name}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
          {item.summary}
        </span>
      </span>
      <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:block">
        {item.updatedAt}
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        strokeWidth={1.6}
      />
    </button>
  );
}
