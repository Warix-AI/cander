"use client";

import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectAgent } from "@/lib/agents/types";

export function AgentNode({
  agent,
  selected,
  onClick,
}: {
  agent: ProjectAgent;
  selected?: boolean;
  onClick: () => void;
}) {
  const meta =
    agent.description?.trim() ||
    (agent.instructions?.trim()
      ? agent.instructions.trim().slice(0, 80) +
        (agent.instructions.length > 80 ? "…" : "")
      : "Identity & instructions");

  return (
    <button
      type="button"
      data-canvas-node
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer rounded-[14px] border bg-background px-3.5 py-3.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition-colors",
        selected
          ? "border-foreground/35 ring-1 ring-foreground/10"
          : "border-border hover:border-foreground/20",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-muted">
          <Bot className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              Agent
            </p>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                agent.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
              )}
            />
          </div>
          <p className="mt-0.5 truncate text-[14.5px] font-medium tracking-[-0.02em]">
            {agent.name || "Untitled agent"}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
            {agent.enabled ? meta : "Disabled"}
          </p>
        </div>
      </div>
    </button>
  );
}
