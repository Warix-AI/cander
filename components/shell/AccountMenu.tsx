"use client";

import { useEffect, useState } from "react";
import { Blocks, CircleUser, Gauge, History, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ColorModeToggle } from "@/components/shell/ColorModeToggle";
import { Dropdown } from "@/components/ui/Controls";
import { signOutAccount } from "@/lib/auth/sign-out";
import { hourlyUsageFor } from "@/lib/hourly-usage";
import {
  USAGE_METER_TONES,
  type UsageMeterId,
} from "@/lib/usage-meters";
import { cn } from "@/lib/utils";

/** Shared footer row chrome for AccountMenu. */
export const SIDEBAR_FOOTER_ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent";

export { signOutAccount };

const flyoutRowClass =
  "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] transition-colors duration-200 hover:bg-sidebar-accent";

const USAGE_CYCLE: {
  id: UsageMeterId;
  label: string;
  key: string;
}[] = [
  { id: "chat", label: "Chat", key: "ai_chat" },
  { id: "images", label: "Image", key: "image_generation" },
  { id: "build", label: "Building", key: "sandbox_build" },
];

const USAGE_CYCLE_MS = 2000;

function UsageFlyoutRow() {
  const [hovered, setHovered] = useState(false);
  const [index, setIndex] = useState(0);
  const [cycleEpoch, setCycleEpoch] = useState(0);

  useEffect(() => {
    if (!hovered) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % USAGE_CYCLE.length);
    }, USAGE_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [hovered, cycleEpoch]);

  const meter = USAGE_CYCLE[index]!;
  const percent = hourlyUsageFor(meter.key).percent;
  const tone = USAGE_METER_TONES[meter.id];

  return (
    <button
      type="button"
      className={flyoutRowClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={() => {
        setHovered(true);
        setIndex((i) => (i + 1) % USAGE_CYCLE.length);
        setCycleEpoch((n) => n + 1);
      }}
      aria-label={`Usage · ${meter.label} ${percent}% this hour`}
    >
      <Gauge
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        strokeWidth={2}
      />
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
            aria-label={`${meter.label} hourly usage`}
          >
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-300",
                tone.bar,
              )}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
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
          <CircleUser
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          General
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-px">
          <div className="border-b border-border/50 px-2 py-2">
            <ColorModeToggle compact />
          </div>
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
          <UsageFlyoutRow />
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
