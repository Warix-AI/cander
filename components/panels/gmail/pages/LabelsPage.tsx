"use client";

import { useState } from "react";
import { SectionLabel, StatLine } from "@/components/panels/Bits";
import { gmailLabels } from "@/lib/gmail";

export function LabelsPage() {
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          list_gmail_labels · manage_gmail_label
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          System and user labels. Create labels agents can apply via
          modify_gmail_message_labels.
        </p>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-3">
        <SectionLabel>Create label</SectionLabel>
        <div className="mt-1 flex gap-2 px-3 pb-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Label name"
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setNote(
                name.trim()
                  ? `manage_gmail_label(action: create, name: "${name.trim()}")`
                  : "Enter a label name.",
              );
              setName("");
            }}
            className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground"
          >
            Create
          </button>
        </div>
        {note ? (
          <p className="px-3 pb-2 font-mono text-[11px] text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>

      <div className="rounded-[10px] border border-border bg-card py-2">
        <SectionLabel>System</SectionLabel>
        {gmailLabels
          .filter((label) => label.type === "system")
          .map((label) => (
            <StatLine
              key={label.id}
              label={label.name}
              value={`${label.count}`}
            />
          ))}
        <SectionLabel>User</SectionLabel>
        {gmailLabels
          .filter((label) => label.type === "user")
          .map((label) => (
            <StatLine
              key={label.id}
              label={label.name}
              value={`${label.count}`}
            />
          ))}
      </div>
    </div>
  );
}
