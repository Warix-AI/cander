"use client";

import { useApp } from "@/components/app/AppProvider";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { formatUsagePercentRemaining } from "@/lib/usage/ai-minutes/format";
import { USAGE_METER_TONES } from "@/lib/usage-meters";
import { useUsageSnapshot } from "@/lib/use-usage-status";
import { cn } from "@/lib/utils";

export function UsageSettings() {
  const { billingPlan } = useApp();
  const { snapshot, loaded } = useUsageSnapshot();
  const minutes = snapshot?.aiMinutes;
  const planLabel = snapshot?.planLabel ?? billingPlan;

  const percentUsed = minutes?.percentUsed ?? 0;
  const isLimitlessUnmetered =
    String(billingPlan) === "limitless" &&
    minutes?.detailLabel === "Custom AI usage";
  const showMeter = Boolean(minutes) && !isLimitlessUnmetered;
  const remainingLabel = !loaded
    ? "Loading…"
    : minutes && !isLimitlessUnmetered
      ? formatUsagePercentRemaining(percentUsed)
      : minutes
        ? "Custom AI usage"
        : "No AI usage yet";

  return (
    <SettingsPage>
      <SettingsHeader title="Usage" />

      <SettingsSection>
        <SettingsGroup>
          <div className="settings-glass-row px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                  AI Usage
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {planLabel} plan · this billing period
                </p>
              </div>
              <p className="shrink-0 tabular-nums text-[12.5px] text-foreground/50 dark:text-zinc-400">
                {remainingLabel}
              </p>
            </div>
            {showMeter ? (
              <div
                className={cn(
                  "mt-2.5 h-2 overflow-hidden rounded-full",
                  USAGE_METER_TONES.chat.track,
                )}
                role="meter"
                aria-valuenow={percentUsed}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="AI usage"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    USAGE_METER_TONES.chat.bar,
                  )}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
            ) : null}
            {snapshot?.notices?.[0] ? (
              <p className="mt-2 text-[12px] text-muted-foreground">
                {snapshot.notices[0]}
              </p>
            ) : null}
          </div>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
