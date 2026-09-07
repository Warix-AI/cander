"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { DashBtn } from "@/components/spaces/ItemSet";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { Dropdown } from "@/components/ui/Controls";
import { canvasStartOptions } from "@/lib/canvas-start-options";
import { CONNECTOR_CONTROL_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type NewCanvasMenuProps = {
  onCreated: (projectId: string) => void;
  /** Icon-only plus trigger (toolbar). */
  icon?: boolean;
  buttonLabel?: string;
};

/** Unified Canvas `+` menu — all Canvas project starts. */
export function NewCanvasMenu({ onCreated, icon = true, buttonLabel = "New" }: NewCanvasMenuProps) {
  const { openQuickSearchBrowser } = useApp();
  const { openCreate, busy, modal } = useCreateProjectFlow(onCreated);
  const options = canvasStartOptions();

  return (
    <>
      <Dropdown
        align="end"
        matchTrigger={false}
        menuClassName="menu-glass-surface min-w-[12rem] !p-2"
        trigger={({ open, toggle }) =>
          icon ? (
            <DashBtn primary icon onClick={toggle} label="New in Canvas">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
            </DashBtn>
          ) : (
            <DashBtn primary onClick={toggle} label="New in Canvas">
              {buttonLabel}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                strokeWidth={1.8}
              />
            </DashBtn>
          )
        }
      >
        {(close) => (
          <>
            {options.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  close();
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
                }}
                className={cn(
                  "menu-row-hover flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.1] disabled:opacity-50",
                  CONNECTOR_CONTROL_RADIUS,
                )}
              >
                <span className="text-[13px] font-medium">{item.label}</span>
                <span className="text-[12px] text-muted-foreground">
                  {item.summary}
                </span>
              </button>
            ))}
          </>
        )}
      </Dropdown>
      {modal}
    </>
  );
}
