"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import { UsageStatusPanel } from "@/components/settings/UsageStatusPanel";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { planLabel } from "@/lib/billing";
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

  const plan = snapshot?.planLabel ?? planLabel(snapshot?.plan ?? billingPlan);

  return (
    <SettingsPage>
      <SettingsHeader
        title="Usage"
        subtitle={
          loaded
            ? `${plan} · Workspace activity and fair-use status.`
            : `${plan} · Loading…`
        }
      />

      <SettingsSection
        title="This month"
        description="Estimates for chat, images, and build activity in this workspace."
      >
        <SettingsGroup>
          <div className="flex flex-col gap-3 px-4 py-3">
            {meters.map((meter) => {
              const tone = USAGE_METER_TONES[meter.id];
              return (
                <div
                  key={meter.id}
                  className="rounded-[12px] bg-muted/50 px-3.5 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-medium tracking-[-0.01em]">
                      {meter.title}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {meter.enabled ? `${meter.percent}%` : "—"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "mt-2 h-1.5 overflow-hidden rounded-full",
                      tone.track,
                    )}
                    role="meter"
                    aria-valuenow={meter.enabled ? meter.percent : 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={meter.title}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        tone.bar,
                      )}
                      style={{
                        width: `${meter.enabled ? meter.percent : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    {meter.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </SettingsGroup>
      </SettingsSection>

      <UsageStatusPanel />
    </SettingsPage>
  );
}
