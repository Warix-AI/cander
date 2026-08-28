"use client";

import { DashFrame } from "@/components/spaces/ItemSet";

/** Connectors are not available yet — placeholder until installs ship. */
export function ConnectorsDashboard() {
  return (
    <DashFrame
      banner={false}
      title="Connectors"
      subtitle="Link apps so Cander can act across them."
    >
      <div className="mt-8 rounded-[10px] border border-border bg-muted/30 px-5 py-8 text-center">
        <p className="text-[15px] font-medium tracking-[-0.02em]">Features coming soon</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Connectors are not available yet. Work, Build, and Explore are ready to use
          today — we will add app connections here when they ship.
        </p>
      </div>
    </DashFrame>
  );
}
