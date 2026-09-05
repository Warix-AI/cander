"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { DashBtn } from "@/components/spaces/ItemSet";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { Dropdown } from "@/components/ui/Controls";
import { canvasStartOptions } from "@/lib/canvas-start-options";

type NewCanvasMenuProps = {
  onCreated: (projectId: string) => void;
  /** Icon-only plus trigger (toolbar). */
  icon?: boolean;
};

/** Unified Canvas `+` menu — all Canvas project starts. */
export function NewCanvasMenu({ onCreated, icon = true }: NewCanvasMenuProps) {
  const { openQuickSearchBrowser } = useApp();
  const { openCreate, busy, modal } = useCreateProjectFlow(onCreated);
  const options = canvasStartOptions();

  return (
    <>
      <Dropdown
        align="end"
        matchTrigger={false}
        menuClassName="min-w-[12rem]"
        trigger={({ open, toggle }) =>
          icon ? (
            <DashBtn primary icon onClick={toggle} label="New in Canvas">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
            </DashBtn>
          ) : (
            <DashBtn primary onClick={toggle} label="New in Canvas">
              New
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
                className="flex w-full flex-col rounded-[10px] px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
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
