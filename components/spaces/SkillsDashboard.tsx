"use client";

import { useMemo, useState } from "react";
import { AreaChart, ChartCard, Kpi } from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ItemSet, LayoutToggle, Pill } from "@/components/spaces/ItemSet";
import { skills as seedSkills, spaceStats } from "@/lib/data";
import type { Skill } from "@/lib/types";
import { cn } from "@/lib/utils";

const useSeries = [1, 2, 2, 4, 3, 5, 6, 5, 7, 8, 7, 8];

export function SkillsDashboard() {
  const {
    workspaceId,
    threads,
    openThread,
    newChat,
    sendMessage,
    armChatInterface,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [local, setLocal] = useState<Skill[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(seedSkills[0]?.id ?? null);

  const all = useMemo(
    () => [
      ...local,
      ...seedSkills.filter((item) => item.workspaceId === workspaceId),
    ],
    [local, workspaceId],
  );
  const selected = all.find((item) => item.id === selectedId) ?? all[0];
  const skillChats = threads.filter(
    (item) => item.spaceId === "skills" && item.workspaceId === workspaceId,
  );
  const meta = spaceStats.skills;

  const createBlank = () => {
    const id = `sk-${Math.random().toString(36).slice(2, 7)}`;
    const next: Skill = {
      id,
      name: "Untitled skill",
      summary: "Describe what Courier should do.",
      when: "When this skill applies",
      workspaceId,
      source: "custom",
      updatedAt: "Just now",
    };
    setLocal((current) => [next, ...current]);
    setSelectedId(id);
  };

  const createWithAi = () => {
    newChat("skills");
    armChatInterface("skills");
    sendMessage("Write a skill for Recursion tone of voice.", { space: "skills" });
  };

  return (
    <DashFrame
      kicker={meta.kicker}
      title="Skills"
      actions={
        <>
          <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
          <Pill onClick={createBlank}>Create skill</Pill>
          <Pill primary onClick={createWithAi}>
            Create with AI
          </Pill>
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <Kpi label="Skills" value={String(all.length)} />
        <Kpi
          label="AI drafted"
          value={String(all.filter((item) => item.source === "ai").length)}
        />
        <Kpi label="Used today" value="8" delta="+3" />
        <Kpi label="Chats" value={String(skillChats.length)} />
      </div>

      <div className="mt-5">
        <ChartCard title="Times applied" hint="Last 12 weeks">
          <AreaChart values={useSeries} />
        </ChartCard>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div>
          <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Library
          </p>
          <div className={spaceLayout === "list" ? "" : "grid gap-3 sm:grid-cols-2"}>
            {all.map((item) => {
              const active = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "w-full rounded-[10px] border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-muted",
                    active && "border-foreground/20 bg-muted",
                    spaceLayout === "list" && "mb-1",
                  )}
                >
                  <p className="text-[14px] font-medium tracking-[-0.02em]">
                    {item.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {item.summary}
                  </p>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    {item.source === "ai" ? "AI drafted" : "Custom"} · {item.updatedAt}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {selected ? (
          <aside className="h-fit rounded-[10px] border border-border bg-card p-4">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              Skill
            </p>
            <p className="mt-2 text-[16px] font-medium tracking-[-0.03em]">
              {selected.name}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {selected.summary}
            </p>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              When: {selected.when}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Pill
                primary
                onClick={() => {
                  newChat("skills");
                  armChatInterface("skills");
                  sendMessage(`Open the ${selected.name} skill and help me edit it.`, {
                    space: "skills",
                    skillId: selected.id,
                  });
                }}
              >
                Edit with AI
              </Pill>
              {skillChats[0] ? (
                <Pill onClick={() => openThread(skillChats[0].id)}>Open last chat</Pill>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <div className="mt-8">
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Chats
        </p>
        <ItemSet
          layout={spaceLayout}
          items={skillChats.map((item) => ({
            id: item.id,
            title: item.title,
            meta: item.updatedAt,
            snippet: item.snippet,
            onClick: () => openThread(item.id),
          }))}
          empty="Skill chats land here."
        />
      </div>
    </DashFrame>
  );
}
