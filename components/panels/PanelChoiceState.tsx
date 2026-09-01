"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { panelChoiceSuggestions } from "@/lib/panel-suggestions";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function PanelChoiceState() {
  const { startDraftProject, setDraftAsDefaultChat } = useApp();
  const mobile = useMobileShell();
  const items = panelChoiceSuggestions();
  const [busy, setBusy] = useState<string | null>(null);
  const [pickDefault, setPickDefault] = useState(false);

  const run = async (key: string, fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const choiceButtonClass =
    "light-surface light-surface-interactive flex w-full items-center gap-3 rounded-[12px] px-3.5 py-3 text-left disabled:opacity-60";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!mobile ? (
        <div className="flex h-11 shrink-0 items-center justify-end px-3">
          <PanelToggle />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
        <p className="text-center text-[15px] font-medium tracking-[-0.02em]">
          What would you like to do?
        </p>

        {pickDefault ? (
          <div className="mt-8 flex w-full max-w-[16rem] flex-col gap-2">
            {items.map((item) => {
              const Icon = item.icon;
              const key = `default-${item.id}`;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(key, () => setDraftAsDefaultChat(item.space))
                  }
                  className={choiceButtonClass}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.65} />
                  {busy === key ? "Saving…" : item.label}
                </button>
              );
            })}
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setPickDefault(false)}
              className="mt-1 rounded-[10px] px-3 py-2.5 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-60"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="mt-8 flex w-full max-w-[16rem] flex-col gap-2">
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
                  className={choiceButtonClass}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-muted">
                    <Icon
                      className="h-3.5 w-3.5 text-foreground"
                      strokeWidth={1.65}
                    />
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
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setPickDefault(true)}
              className={cn(
                choiceButtonClass,
                "text-muted-foreground hover:text-foreground",
              )}
            >
              Add as default chat to spaces
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
