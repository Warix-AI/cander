"use client";

import { useApp } from "@/components/app/AppProvider";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { useMobileShell } from "@/lib/use-media-query";
import { panelChoiceSuggestions } from "@/lib/panel-suggestions";

export function PanelChoiceState() {
  const { selectChatSpace } = useApp();
  const mobile = useMobileShell();
  const items = panelChoiceSuggestions();

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
          Pick a direction, or keep chatting on the left.
        </p>
      </div>
      <div className="mt-8 grid w-full max-w-[16rem] gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                selectChatSpace(
                  item.space,
                  item.researchTool
                    ? { researchTool: item.researchTool }
                    : undefined,
                )
              }
              className="light-surface light-surface-interactive flex items-center gap-3 rounded-[12px] px-3.5 py-3 text-left"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-muted">
                <Icon className="h-3.5 w-3.5 text-foreground" strokeWidth={1.65} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium tracking-[-0.01em]">
                  {item.label}
                </span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {item.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
