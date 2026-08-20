"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { projects } from "@/lib/data";
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

function areaOf(item: Project): PersonalScope {
  if (areaById[item.id]) return areaById[item.id];
  if (item.space === "finances") return "money";
  if (item.space === "health") return "health";
  return "today";
}

export function PersonalDashboard() {
  const { spaceId, workspaceId, newChat, sendMessage, spaceLayout, setSpaceLayout } =
    useApp();
  const [scope, setScope] = useState<PersonalScope | "all">("all");

  useEffect(() => {
    if (spaceId === "health") setScope("health");
    else if (spaceId === "finances") setScope("money");
  }, [spaceId]);

  const items = projects.filter((item) => {
    if (
      item.workspaceId !== workspaceId ||
      !(
        item.space === "personal" ||
        item.space === "finances" ||
        item.space === "health"
      )
    ) {
      return false;
    }
    if (scope === "all") return true;
    return areaOf(item) === scope;
  });

  const start = () => {
    newChat("personal");
  };

  const ask = (text: string) => {
    newChat("personal");
    sendMessage(text, { space: "personal" });
  };

  return (
    <DashFrame
      space="personal"
      title="Personal"
      subtitle="Handle today, money, health, goals, and the car."
      actions={
        <>
          <DashBtn primary onClick={start}>
            New chat
          </DashBtn>
          <SpaceSettingsButton space="personal" />
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-end gap-3">
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <section className="mt-6">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          Open
        </h2>
        {spaceLayout === "cards" ? (
          <div className="mt-3 grid grid-cols-1 gap-3 @min-[440px]:grid-cols-2">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => ask(`Help me with ${item.name.toLowerCase()}.`)}
                  className="rounded-[10px] border border-border px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/60"
                >
                  <span className="block text-[14px] font-medium tracking-[-0.02em]">
                    {item.name}
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                    {item.summary}
                  </span>
                  <span className="mt-2 block text-[12px] text-muted-foreground">
                    {item.updatedAt}
                  </span>
                </button>
              ))
            ) : (
              <p className="col-span-full px-1 py-4 text-[13px] text-muted-foreground">
                Nothing open yet. Start a chat to add something.
              </p>
            )}
          </div>
        ) : (
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
                Nothing open yet. Start a chat to add something.
              </p>
            )}
          </div>
        )}
      </section>
    </DashFrame>
  );
}
