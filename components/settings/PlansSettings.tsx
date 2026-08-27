"use client";

import { useApp } from "@/components/app/AppProvider";
import { PreviewAccount } from "@/components/settings/PreviewAccount";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { useMobileShell } from "@/lib/use-media-query";
import {
  courierPlans,
  orgSeatMix,
  planLabel,
  seatMixLabel,
} from "@/lib/billing";
import { getDataBackend } from "@/lib/data-backend";
import { orgMembersOf } from "@/lib/entitlements";
import { isMobileShell } from "@/lib/mobile-shell";

export function PlansSettings() {
  const { actor, entitlements, hostingMode, orgMembers } = useApp();
  const mobile = useMobileShell();
  const nativeShell = isMobileShell();
  const showDemoPicker =
    getDataBackend() === "local" && !nativeShell && !mobile;

  const roster = orgMembersOf(orgMembers);
  const seatMix = orgSeatMix(orgMembers);
  const mixSummary = seatMixLabel(seatMix).join(" · ");
  const currentPlan =
    courierPlans.find((plan) => plan.id === entitlements.plan) ??
    courierPlans[0]!;

  return (
    <SettingsPage>
      <SettingsHeader
        kicker="Plan"
        title="Your plan"
        subtitle="Account status for this seat. Billing and upgrades are managed outside the app."
      />

      {showDemoPicker ? (
        <div className="mt-8">
          <PreviewAccount />
        </div>
      ) : null}

      <SettingsSection title="Current plan" className="mt-8">
        <SettingsGroup>
          <div className="px-4 py-4">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              {currentPlan.audience}
            </p>
            <h3 className="mt-1.5 text-[1.35rem] font-medium tracking-[-0.03em]">
              {planLabel(entitlements.plan)}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {currentPlan.blurb}
            </p>
            <ul className="mt-4 space-y-1.5 text-[13px] text-muted-foreground">
              {currentPlan.points.map((point) => (
                <li key={point}>· {point}</li>
              ))}
            </ul>
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="This seat" className="mt-6">
        <SettingsGroup>
          <div className="px-4 py-4 text-[14px] leading-relaxed text-muted-foreground">
            <p>
              Signed in as{" "}
              <span className="text-foreground">{actor.name}</span>
              {" · "}
              {planLabel(entitlements.plan)}
              {entitlements.orgActive ? ` · ${entitlements.role}` : ""}
              {entitlements.showInviteWall ? " · pending invite" : ""}.
            </p>
            {entitlements.isMember ? (
              <p className="mt-2">
                Billed to the organization. Runtime depth:{" "}
                {entitlements.devDepthLabel.toLowerCase()}.
              </p>
            ) : null}
            {entitlements.showInviteWall ? (
              <p className="mt-2">
                Acme is a Max organization. A Max or Ultra seat is required for
                shared workspaces. Ask an admin to add one, or stay on your
                personal {planLabel(entitlements.plan)} account.
              </p>
            ) : null}
          </div>
        </SettingsGroup>
      </SettingsSection>

      {entitlements.showPlansBilling ? (
        <SettingsSection title="Organization" className="mt-6">
          <SettingsGroup>
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
              <BillStat k="Seat mix" v={mixSummary || "None"} />
              <BillStat
                k="Active seats"
                v={`${roster.filter((m) => m.seatStatus === "active").length}`}
              />
            </div>
            <p className="border-t border-border px-4 py-3 text-[12.5px] text-muted-foreground">
              Seat changes and billing are managed on the web. Hosting mode:{" "}
              {hostingMode}.
            </p>
          </SettingsGroup>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

function BillStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{k}</p>
      <p className="mt-1 text-[15px] font-medium tracking-[-0.02em]">{v}</p>
    </div>
  );
}
