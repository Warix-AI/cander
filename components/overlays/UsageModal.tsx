"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { planLabel } from "@/lib/billing";
import {
  USAGE_METER_TONES,
  buildUsageMeters,
} from "@/lib/usage-meters";
import { useUsageSnapshot } from "@/lib/use-usage-status";
import { cn } from "@/lib/utils";

export function UsageModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { workspaceId, billingPlan, openSettings } = useApp();
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
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="usage-modal-title"
      className="flex w-[min(22rem,calc(100vw-2rem))] flex-col"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            id="usage-modal-title"
            className="text-[16px] font-semibold tracking-[-0.03em]"
          >
            Usage
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {plan}
            {!loaded ? " · Loading…" : null}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-5 pb-5">
        {meters.map((meter) => {
          const tone = USAGE_METER_TONES[meter.id];
          return (
            <div key={meter.id} className="rounded-[12px] bg-muted/50 px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium tracking-[-0.01em]">
                  {meter.title}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {meter.enabled ? `${meter.percent}%` : "—"}
                </p>
              </div>
              <div
                className={cn("mt-2 h-1.5 overflow-hidden rounded-full", tone.track)}
                role="meter"
                aria-valuenow={meter.enabled ? meter.percent : 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={meter.title}
              >
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500", tone.bar)}
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

        <button
          type="button"
          className="mt-1 text-left text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            onClose();
            openSettings("general");
          }}
        >
          Open in Settings
        </button>
      </div>
    </Modal>
  );
}
