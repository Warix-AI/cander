"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  Pill,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { StatsBanner } from "@/components/spaces/StatsBanner";
import { projects, spaceStats } from "@/lib/data";
import type { Project } from "@/lib/types";

type PersonalScope = "today" | "money" | "health" | "goals" | "car";

const areaById: Record<string, PersonalScope> = {
  "weekend-plans": "today",
  subscriptions: "money",
  runway: "money",
  "q3-invoices": "money",
  "infra-spend": "money",
  "ops-close": "money",
  "benefits-review": "health",
  "care-plan": "health",
  "ops-wellness": "health",
  "annual-goals": "goals",
  "car-service": "car",
};

const areas: {
  id: PersonalScope;
  label: string;
  cta: string;
  kicker: string;
  prompts: string[];
  empty: string;
  stats: { label: string; value: string; delta?: string }[];
}[] = [
  {
    id: "today",
    label: "Today",
    cta: "New personal",
    kicker: "Plans, bills, and whatever is due",
    stats: spaceStats.personal.stats,
    prompts: [
      "What’s on my plate today?",
      "Plan this weekend.",
      "Any birthdays or reservations coming up?",
    ],
    empty: "Nothing on the list yet. Ask Courier about today, this weekend, or what’s due.",
  },
  {
    id: "money",
    label: "Money",
    cta: "New money",
    kicker: "Books, invoices, and spend",
    stats: spaceStats.finances.stats,
    prompts: [
      "Summarize this month's invoices and what's still unpaid.",
      "What's our runway and burn looking like?",
      "Flag anything that needs a receipt or approval.",
    ],
    empty: "Nothing tracked yet. Ask Courier about invoices, runway, or spend.",
  },
  {
    id: "health",
    label: "Health",
    cta: "New health",
    kicker: "Care plans, benefits, and follow-ups",
    stats: spaceStats.health.stats,
    prompts: [
      "Draft a care-plan recap from last quarter's notes.",
      "Compare our benefits options for open enrollment.",
      "What follow-ups are due this week?",
    ],
    empty: "Nothing tracked yet. Ask Courier about benefits, care plans, or wellness.",
  },
  {
    id: "goals",
    label: "Goals",
    cta: "New goal",
    kicker: "What you’re actually trying to finish",
    stats: [
      { label: "This year", value: "4" },
      { label: "On track", value: "2" },
      { label: "Due soon", value: "1" },
      { label: "Parked", value: "1" },
    ],
    prompts: [
      "What should I finish this quarter?",
      "Break this year’s goals into weekly moves.",
      "What’s slipping that I still care about?",
    ],
    empty: "No goals yet. Ask Courier to set one, recap the year, or pick what to drop.",
  },
  {
    id: "car",
    label: "Car",
    cta: "New car",
    kicker: "Registration, insurance, and service",
    stats: [
      { label: "Service due", value: "Oct" },
      { label: "Insurance", value: "Active" },
      { label: "Registration", value: "Mar" },
      { label: "Open items", value: "2" },
    ],
    prompts: [
      "When is the car due for service?",
      "What does insurance cover if I get a loaner?",
      "Remind me before registration lapses.",
    ],
    empty: "Nothing on the car yet. Ask Courier about service, insurance, or registration.",
  },
];

function areaOf(item: Project): PersonalScope {
  if (areaById[item.id]) return areaById[item.id];
  if (item.space === "finances") return "money";
  if (item.space === "health") return "health";
  return "today";
}

export function PersonalDashboard() {
  const { spaceId, workspaceId, newChat, sendMessage, armChatInterface } =
    useApp();
  const [scope, setScope] = useState<PersonalScope>("today");
  const meta = spaceStats.personal;
  const area = areas.find((item) => item.id === scope) ?? areas[0];

  useEffect(() => {
    if (spaceId === "health") setScope("health");
    else if (spaceId === "finances") setScope("money");
  }, [spaceId]);

  const items = projects.filter(
    (item) =>
      item.workspaceId === workspaceId &&
      (item.space === "personal" ||
        item.space === "finances" ||
        item.space === "health") &&
      areaOf(item) === scope,
  );

  const start = () => {
    newChat("personal");
    armChatInterface("personal");
  };

  const ask = (text: string) => {
    start();
    sendMessage(text, { space: "personal" });
  };

  return (
    <DashFrame
      space="personal"
      kicker={meta.kicker}
      title="Personal"
      subtitle="Today, money, health, goals, and the car — kept separate from product work."
      actions={
        <>
          <SpaceSettingsButton space="personal" />
          <DashBtn primary onClick={start}>
            {area.cta}
          </DashBtn>
        </>
      }
    >
      <div>
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as PersonalScope)}
          options={areas.map((item) => ({ id: item.id, label: item.label }))}
        />
      </div>

      <p className="mt-4 text-[14px] text-muted-foreground">{area.kicker}</p>
      <StatsBanner stats={area.stats} />

      <div className="mt-6 flex flex-wrap gap-2">
        {area.prompts.map((prompt) => (
          <Pill key={prompt} onClick={() => ask(prompt)}>
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
                onClick={() => ask(`Help me with ${item.name.toLowerCase()}.`)}
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
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
              {area.empty}
            </p>
          )}
        </div>
      </section>
    </DashFrame>
  );
}
