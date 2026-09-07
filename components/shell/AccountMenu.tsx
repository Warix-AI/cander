"use client";

import { useState } from "react";
import { Blocks, CircleUser, Gauge, History, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ColorModeToggle } from "@/components/shell/ColorModeToggle";
import { Dropdown } from "@/components/ui/Controls";
import { signOutAccount } from "@/lib/auth/sign-out";
import { closeAllPinSections } from "@/lib/pin-display-prefs";
import { USAGE_METER_TONES } from "@/lib/usage-meters";
import { useUsageStatusPercent } from "@/lib/use-usage-status";
import { cn } from "@/lib/utils";

/** Shared footer row chrome for AccountMenu — matches SidebarNavButton. */
export const SIDEBAR_FOOTER_ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[15px] transition-colors duration-200 hover:bg-sidebar-accent";

export { signOutAccount };

const flyoutRowClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[15px] transition-colors duration-200 hover:bg-sidebar-accent";

const flyoutIconClass = "h-4 w-4 shrink-0 text-muted-foreground";

function UsageFlyoutRow({ onOpen }: { onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  const { percent, label } = useUsageStatusPercent();
  const tone = USAGE_METER_TONES.chat;

  return (
    <button
      type="button"
      className={flyoutRowClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={onOpen}
      aria-label={`Usage · ${label}`}
    >
      <Gauge className={flyoutIconClass} strokeWidth={2} />
      <span className="shrink-0">Usage</span>
      {hovered ? (
        <>
          <span
            className={cn(
              "mx-0.5 h-1.5 min-w-[2.5rem] flex-1 overflow-hidden rounded-full",
              tone.track,
            )}
            role="meter"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Account usage"
          >
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-300",
                tone.bar,
              )}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="shrink-0 tabular-nums text-[13px] text-muted-foreground">
            {percent}%
          </span>
        </>
      ) : null}
    </button>
  );
}

export function AccountMenu() {
  const { view, openSettings, openRecents, openSpace } = useApp();

  return (
    <Dropdown
      className="w-full"
      placement="top"
      align="start"
      matchTrigger
      menuClassName="!p-1 menu-glass-surface"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            SIDEBAR_FOOTER_ROW,
            (open || view === "settings") && "bg-sidebar-accent font-medium",
          )}
          aria-label="General"
          aria-expanded={open}
        >
          <CircleUser
            className="h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          General
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-px">
          <div className="px-2 py-2">
            <ColorModeToggle />
          </div>
          <button
            type="button"
            className={flyoutRowClass}
            onClick={() => {
              closeAllPinSections();
              openSpace("connectors");
              close();
            }}
          >
            <Blocks
              className={flyoutIconClass}
              strokeWidth={2}
            />
            Connectors
          </button>
          <UsageFlyoutRow
            onOpen={() => {
              closeAllPinSections();
              openSettings("usage");
              close();
            }}
          />
          <button
            type="button"
            className={flyoutRowClass}
            onClick={() => {
              closeAllPinSections();
              openRecents();
              close();
            }}
          >
            <History
              className={flyoutIconClass}
              strokeWidth={2}
            />
            Recents
          </button>
          <button
            type="button"
            className={cn(
              flyoutRowClass,
              view === "settings" && "bg-sidebar-accent font-medium",
            )}
            onClick={() => {
              closeAllPinSections();
              openSettings();
              close();
            }}
          >
            <Settings
              className={flyoutIconClass}
              strokeWidth={2}
            />
            Settings
          </button>
        </div>
      )}
    </Dropdown>
  );
}
