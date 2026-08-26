"use client";

import { useMemo, useState } from "react";
import { Kpi } from "@/components/ui/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashBtn, DashFrame, LayoutToggle, ScopeToggle, SpaceSettingsButton } from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { skills as seedSkills, spaceStats } from "@/lib/data";
import type { Skill } from "@/lib/types";

export function SkillsDashboard() {
  const {
    workspaceId,
    newChat,
    sendMessage,
    armChatInterface,
    openSkill,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [local, setLocal] = useState<Skill[]>([]);
  const [scope, setScope] = useState("all");

  const all = useMemo(
    () => [
      ...local,
      ...seedSkills.filter((item) => item.workspaceId === workspaceId),
    ],
    [local, workspaceId],
  );
  const meta = spaceStats.skills;
  const grouped = useMemo(() => {
    const groups = [
      { id: "ai", name: "AI drafted", items: all.filter((item) => item.source === "ai") },
      { id: "custom", name: "Custom", items: all.filter((item) => item.source === "custom") },
    ];
    return groups.filter((group) => group.items.length);
  }, [all]);

  const createBlank = () => {
    const id = `sk-${Math.random().toString(36).slice(2, 7)}`;
    const next: Skill = {
      id,
      name: "Untitled skill",
      summary: "Describe what it should do.",
      when: "When this skill applies",
      workspaceId,
      source: "custom",
      updatedAt: "Just now",
    };
    setLocal((current) => [next, ...current]);
    openSkill(id);
  };

  return (
    <DashFrame
      space="skills"
      kicker={meta.kicker}
      title="Tasks"
      actions={
        <>
          <SpaceSettingsButton space="skills" />
          <DashBtn onClick={createBlank}>Create task</DashBtn>
          <DashBtn
            primary
            onClick={() => {
              newChat("skills");
              armChatInterface("skills");
              sendMessage("Write a skill for Recursion tone of voice.", {
                space: "skills",
              });
            }}
          >
            Create with AI
          </DashBtn>
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        {meta.stats.map((stat) => (
          <Kpi key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 @min-[420px]:flex-row @min-[420px]:flex-wrap @min-[420px]:items-center @min-[420px]:justify-between">
        <ScopeToggle
          wrap
          value={scope}
          onChange={setScope}
          options={[
            { id: "all", label: "All" },
            { id: "projects", label: "Library" },
          ]}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <div className="mt-4">
        {scope === "all" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="skill"
            items={all.map(toEntry)}
            onOpen={openSkill}
            empty="No tasks in this workspace."
          />
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.id}>
                <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                  {group.name}
                </p>
                <PreviewGrid
                  layout={spaceLayout}
                  kind="skill"
                  items={group.items.map(toEntry)}
                  onOpen={openSkill}
                  empty="Nothing here."
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </DashFrame>
  );
}

function toEntry(item: Skill) {
  return {
    id: item.id,
    name: item.name,
    projectId: item.id,
    meta: `Edited ${item.updatedAt}`,
    badge: item.source === "ai" ? "AI drafted" : undefined,
  };
}
