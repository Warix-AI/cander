"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashFrame,
  Pill,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { StatsBanner } from "@/components/spaces/StatsBanner";
import { projects, spaceStats } from "@/lib/data";
import type { Project } from "@/lib/types";

type PersonalScope = "today" | "money" | "health";

const todayPrompts = [
  "What’s on my plate today?",
  "Plan this weekend.",
  "Any birthdays or reservations coming up?",
];

const moneyPrompts = [
  "Summarize this month's invoices and what's still unpaid.",
  "What's our runway and burn looking like?",
  "Flag anything that needs a receipt or approval.",
];

const healthPrompts = [
  "Draft a care-plan recap from last quarter's notes.",
  "Compare our benefits options for open enrollment.",
  "What follow-ups are due this week?",
];

export function PersonalDashboard() {
  const { spaceId, newChat, sendMessage, armChatInterface } = useApp();
  const [scope, setScope] = useState<PersonalScope>("today");
  const meta = spaceStats.personal;

  useEffect(() => {
    if (spaceId === "health") setScope("health");
    else if (spaceId === "finances") setScope("money");
  }, [spaceId]);

  const ask = (text: string) => {
    newChat("personal");
    armChatInterface("personal");
    sendMessage(text, { space: "personal" });
  };

  return (
    <DashFrame
      space="personal"
      kicker={meta.kicker}
      title="Personal"
      subtitle="Today, money, and health — kept separate from product work."
      actions={<SpaceSettingsButton space="personal" />}
    >
      <div>
        <ScopeToggle
          value={scope}
          onChange={(value) => setScope(value as PersonalScope)}
          options={[
            { id: "today", label: "Today" },
            { id: "money", label: "Money" },
            { id: "health", label: "Health" },
          ]}
        />
      </div>

      {scope === "today" ? (
        <TodayPanel onAsk={ask} />
      ) : scope === "money" ? (
        <MoneyPanel onAsk={ask} />
      ) : (
        <HealthPanel onAsk={ask} />
      )}
    </DashFrame>
  );
}

function TodayPanel({ onAsk }: { onAsk: (text: string) => void }) {
  const { workspaceId } = useApp();
  const items = projects.filter(
    (item) => item.space === "personal" && item.workspaceId === workspaceId,
  );

  return (
    <PersonalPanel
      kicker="Plans, bills, and whatever is due"
      stats={spaceStats.personal.stats}
      prompts={todayPrompts}
      items={items}
      onAsk={onAsk}
      empty="Nothing on the list yet. Ask Courier about today, this weekend, or what’s due."
    />
  );
}

function MoneyPanel({ onAsk }: { onAsk: (text: string) => void }) {
  const { workspaceId } = useApp();
  const items = projects.filter(
    (item) => item.space === "finances" && item.workspaceId === workspaceId,
  );

  return (
    <PersonalPanel
      kicker="Books, invoices, and spend"
      stats={spaceStats.finances.stats}
      prompts={moneyPrompts}
      items={items}
      onAsk={onAsk}
      empty="Nothing tracked yet. Ask Courier about invoices, runway, or spend."
    />
  );
}

function HealthPanel({ onAsk }: { onAsk: (text: string) => void }) {
  const { workspaceId } = useApp();
  const items = projects.filter(
    (item) => item.space === "health" && item.workspaceId === workspaceId,
  );

  return (
    <PersonalPanel
      kicker="Care plans, benefits, and follow-ups"
      stats={spaceStats.health.stats}
      prompts={healthPrompts}
      items={items}
      onAsk={onAsk}
      empty="Nothing tracked yet. Ask Courier about benefits, care plans, or wellness."
    />
  );
}

function PersonalPanel({
  kicker,
  stats,
  prompts,
  items,
  onAsk,
  empty,
}: {
  kicker: string;
  stats: { label: string; value: string; delta?: string }[];
  prompts: string[];
  items: Project[];
  onAsk: (text: string) => void;
  empty: string;
}) {
  return (
    <>
      <p className="mt-4 text-[14px] text-muted-foreground">{kicker}</p>

      <StatsBanner stats={stats} />

      <div className="mt-6 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <Pill key={prompt} onClick={() => onAsk(prompt)}>
            {prompt}
          </Pill>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          Open
        </h2>
        <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
          {items.length ? (
            items.map((item) => (
              <button
                key={item.id}
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
            ))
          ) : (
            <p className="px-4 py-6 text-[13px] text-muted-foreground">{empty}</p>
          )}
        </div>
      </section>
    </>
  );
}
