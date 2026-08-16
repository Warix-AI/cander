"use client";

import { useApp } from "@/components/app/AppProvider";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import { skills } from "@/lib/data";
import type { SkillsTool } from "@/lib/types";

const tools: { id: SkillsTool; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "editor", label: "Editor" },
  { id: "tests", label: "When" },
  { id: "versions", label: "Versions" },
];

export function SkillsPanel() {
  const { skillId, skillsTool, setSkillsTool, workspaceId } = useApp();
  const skill =
    skills.find((item) => item.id === skillId) ??
    skills.find((item) => item.workspaceId === workspaceId) ??
    skills[0];

  const tool = skillsTool === "overview" ? "editor" : skillsTool;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <SegTabs
          items={tools}
          value={tool}
          onChange={(id) => setSkillsTool(id as SkillsTool)}
        />
      </div>

      {tool === "editor" ? (
        <div className="space-y-3 p-4">
          <Field label="Name" value={skill?.name ?? "Untitled skill"} />
          <Field
            label="When to use"
            value={skill?.when ?? "Whenever this pattern shows up in chat."}
          />
          <label className="block">
            <span className="font-mono text-[11px] text-muted-foreground">
              Instructions
            </span>
            <textarea
              defaultValue={
                skill?.summary ??
                "Write the steps Courier should follow. Keep it short."
              }
              rows={8}
              className="mt-1 w-full resize-none rounded-[10px] border border-foreground/10 bg-background px-3 py-2 text-[13.5px] leading-relaxed outline-none"
            />
          </label>
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
          >
            Save skill
          </button>
        </div>
      ) : null}

      {tool === "tests" ? (
        <div className="py-2">
          <SectionLabel>Triggers</SectionLabel>
          <Row title={skill?.when ?? "When this skill applies"} meta="Active" />
          <Row title="Never in Scheduled" meta="Off" />
        </div>
      ) : null}

      {tool === "versions" ? (
        <div className="py-2">
          <Row title="Current" meta={skill?.updatedAt ?? "Now"} />
          <Row title="AI draft" meta={skill?.source === "ai" ? "Attached" : "—"} />
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <input
        defaultValue={value}
        className="mt-1 h-10 w-full rounded-[10px] border border-foreground/10 bg-background px-3 text-[13.5px] outline-none"
      />
    </label>
  );
}
