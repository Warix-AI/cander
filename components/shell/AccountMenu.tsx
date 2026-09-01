"use client";

import { Blocks, History, Settings, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Dropdown } from "@/components/ui/Controls";
import { signOutAccount } from "@/lib/auth/sign-out";
import { cn } from "@/lib/utils";

/** Shared footer row chrome for AccountMenu. */
export const SIDEBAR_FOOTER_ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent";

export { signOutAccount };

const flyoutRowClass =
  "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] transition-colors duration-200 hover:bg-sidebar-accent";

export function AccountMenu() {
  const { view, openSettings, openRecents, openSpace } = useApp();

  return (
    <Dropdown
      className="w-full"
      placement="top"
      align="start"
      matchTrigger
      menuClassName="!p-1"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            SIDEBAR_FOOTER_ROW,
            "w-full text-[13.5px]",
            (open || view === "settings") && "bg-sidebar-accent font-medium",
          )}
          aria-label="General"
          aria-expanded={open}
        >
          <SlidersHorizontal
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          General
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-px">
          <button
            type="button"
            className={flyoutRowClass}
            onClick={() => {
              openSpace("connectors");
              close();
            }}
          >
            <Blocks
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            Connectors
          </button>
          <button
            type="button"
            className={flyoutRowClass}
            onClick={() => {
              openRecents();
              close();
            }}
          >
            <History
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            Recents
          </button>
          <button
            type="button"
            className={cn(
              flyoutRowClass,
              "border-t border-border/50",
              view === "settings" && "bg-sidebar-accent font-medium",
            )}
            onClick={() => {
              openSettings();
              close();
            }}
          >
            <Settings
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            Settings
          </button>
        </div>
      )}
    </Dropdown>
  );
}
