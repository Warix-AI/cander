"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PanelToggle } from "@/components/shell/PanelToggle";
import {
  panelChoiceSuggestions,
  panelDefaultChatChoices,
} from "@/lib/panel-suggestions";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function PanelChoiceState() {
  const { startDraftProject, setDraftAsDefaultChat } = useApp();
  const mobile = useMobileShell();
  const items = panelChoiceSuggestions();
  const defaults = panelDefaultChatChoices();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!mobile ? (
        <div className="flex h-11 shrink-0 items-center justify-end px-3">
          <PanelToggle />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[18rem] text-center">
          <p className="text-[15px] font-medium tracking-[-0.02em]">
            What would you like to do?
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Start a project from this chat, or set it as a space default below.
          </p>
        </div>
        <div className="mt-8 grid w-full max-w-[16rem] gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(item.id, () => startDraftProject(item.space))
                }
                className="light-surface light-surface-interactive flex items-center gap-3 rounded-[12px] px-3.5 py-3 text-left disabled:opacity-60"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-muted">
                  <Icon className="h-3.5 w-3.5 text-foreground" strokeWidth={1.65} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium tracking-[-0.01em]">
                    {busy === item.id ? "Starting…" : item.label}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-8 w-full max-w-[16rem] border-t border-border/60 pt-6">
          <p className="text-center text-[12px] font-medium tracking-[-0.01em] text-foreground">
            Add as default chat
          </p>
          <p className="mt-1.5 text-center text-[11.5px] leading-relaxed text-muted-foreground">
            Use this conversation when you open a space from the sidebar.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {defaults.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(item.id, () => setDraftAsDefaultChat(item.space))
                }
                className={cn(
                  "rounded-[10px] px-3 py-2.5 text-[12.5px] font-medium tracking-[-0.01em] transition-colors",
                  "text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-60",
                )}
              >
                {busy === item.id ? "Saving…" : `Use for ${item.label}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
