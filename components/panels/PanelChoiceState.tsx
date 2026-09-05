"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { canvasStartOptions } from "@/lib/canvas-start-options";
import { useMobileShell } from "@/lib/use-media-query";

export function PanelChoiceState() {
  const { openProject, openQuickSearchBrowser, threadId } = useApp();
  const mobile = useMobileShell();
  const items = canvasStartOptions();
  const [busy, setBusy] = useState<string | null>(null);
  const { openCreate, busy: createBusy, modal } = useCreateProjectFlow(
    (projectId) => {
      openProject(projectId, {
        migrateFromThreadId: threadId,
        landOnPanel: true,
      });
    },
  );

  const run = async (key: string, fn: () => void | Promise<void>) => {
    if (busy || createBusy) return;
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <p className="text-center text-[15px] font-medium tracking-[-0.02em]">
          What would you like to do?
        </p>

        <div className="mt-8 flex w-full max-w-[16rem] flex-col gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                disabled={Boolean(busy) || createBusy}
                onClick={() =>
                  void run(item.id, () => {
                    if (item.action === "quick-search") {
                      openQuickSearchBrowser();
                      return;
                    }
                    if (!item.space || !item.kind || !item.title) return;
                    openCreate({
                      space: item.space,
                      kind: item.kind,
                      defaultTitle: item.title,
                      summary: item.summary,
                    });
                  })
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
                    {item.summary}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {modal}
    </div>
  );
}
