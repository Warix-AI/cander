"use client";

import { useState } from "react";
import { gmailFilters } from "@/lib/gmail";

export function FiltersPage() {
  const [criteria, setCriteria] = useState("");
  const [action, setAction] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          list_gmail_filters · manage_gmail_filter
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Filters route mail automatically — the same rules agents can create
          through MCP.
        </p>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-3">
        <p className="text-[13px] font-medium">New filter</p>
        <label className="mt-3 block">
          <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            Criteria
          </span>
          <input
            value={criteria}
            onChange={(event) => setCriteria(event.target.value)}
            placeholder="from:partner@example.com"
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none"
          />
        </label>
        <label className="mt-2 block">
          <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            Action
          </span>
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Apply label Partners"
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setNote(
              criteria.trim() && action.trim()
                ? `manage_gmail_filter(action: create) · ${criteria} → ${action}`
                : "Add criteria and an action.",
            );
            setCriteria("");
            setAction("");
          }}
          className="mt-3 inline-flex h-8 items-center rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground"
        >
          Create filter
        </button>
        {note ? (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {gmailFilters.map((filter) => (
          <li
            key={filter.id}
            className="rounded-[10px] border border-border px-3 py-2.5"
          >
            <p className="font-mono text-[12px]">{filter.criteria}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {filter.action}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
