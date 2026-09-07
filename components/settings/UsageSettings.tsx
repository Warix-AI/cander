"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import {
  USAGE_METER_TONES,
  buildUsageMeters,
} from "@/lib/usage-meters";
import { useUsageSnapshot } from "@/lib/use-usage-status";
import { cn } from "@/lib/utils";

export function UsageSettings() {
  const { workspaceId, billingPlan } = useApp();
  const { snapshot, loaded } = useUsageSnapshot();

  const meters = useMemo(
    () =>
      buildUsageMeters({
        plan: snapshot?.plan ?? billingPlan,
        workspaceId,
        features: snapshot?.features,
      }),
    [billingPlan, snapshot?.features, snapshot?.plan, workspaceId],
  );

  const enabledMeters = meters.filter((meter) => meter.enabled);
  const overallPercent = enabledMeters.length
    ? Math.max(...enabledMeters.map((meter) => meter.percent))
    : 0;
  const usageLabel = !loaded
    ? "Loading…"
    : enabledMeters.length
      ? `${overallPercent}%`
      : "No usage yet";

  return (
    <SettingsPage>
      <SettingsHeader title="Usage" />

      <SettingsSection>
        <SettingsGroup>
          <div className="settings-glass-row px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                Usage
              </p>
              <p className="tabular-nums text-[12.5px] text-foreground/50 dark:text-zinc-400">
                {usageLabel}
              </p>
            </div>
            <div
              className={cn(
                "mt-2.5 h-2 overflow-hidden rounded-full",
                USAGE_METER_TONES.chat.track,
              )}
              role="meter"
              aria-valuenow={overallPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Account usage"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  USAGE_METER_TONES.chat.bar,
                )}
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
