"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PreviewAccount } from "@/components/settings/PreviewAccount";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { useMobileShell } from "@/lib/use-media-query";
import { planLabel } from "@/lib/billing";
import { getDataBackend, isSupabaseConfigured } from "@/lib/data-backend";
import { isPaidPlan, webAppPlansSettingsUrl } from "@/lib/plans";
import { isMobileShell, openExternalUrl } from "@/lib/mobile-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BillingStatus = {
  plan: string;
  subscriptionStatus: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
};

function formatPeriodEnd(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function daysRemaining(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function PlansSettings() {
  const { entitlements, actor } = useApp();
  const mobile = useMobileShell();
  const nativeShell = isMobileShell();
  const showDemoPicker =
    getDataBackend() === "local" && !nativeShell && !mobile;

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  const loadBilling = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch("/api/billing/cancel", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        // Soft-fail — plan UI still shows entitlements.plan from the session actor.
        const data = await response.json().catch(() => ({}));
        console.warn(
          "[cander] billing status",
          data.error ?? response.status,
        );
        return;
      }
      const data = await response.json();
      setBilling(data);
      setBillingError(null);
    } catch (err) {
      console.warn("[cander] billing status fetch failed", err);
      // Do not surface network blips as a red error on Free / unpaid seats.
    }
  };

  useEffect(() => {
    void loadBilling();
  }, []);

  const periodLabel = formatPeriodEnd(
    billing?.periodEnd ?? actor.subscriptionPeriodEnd,
  );
  const remainingDays = daysRemaining(
    billing?.periodEnd ?? actor.subscriptionPeriodEnd,
  );
  const cancelScheduled =
    billing?.cancelAtPeriodEnd ?? actor.cancelAtPeriodEnd ?? false;
  const paidPlan = isPaidPlan(entitlements.plan);
  const showCancel =
    paidPlan &&
    (billing?.hasSubscription ||
      Boolean(actor.subscriptionPeriodEnd) ||
      actor.subscriptionStatus === "active" ||
      actor.subscriptionStatus === "trialing");

  const cancelPlan = async () => {
    if (nativeShell) {
      openExternalUrl(webAppPlansSettingsUrl());
      return;
    }
    if (!isSupabaseConfigured()) return;

    setCancelBusy(true);
    setBillingError(null);
    setCancelMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sign in to manage billing.");
      }

      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (data.bypass) {
        setCancelMessage("Billing is not connected in this environment.");
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Could not cancel plan.");
      }

      setBilling((current) => ({
        plan: current?.plan ?? entitlements.plan,
        subscriptionStatus: current?.subscriptionStatus ?? "active",
        periodEnd: data.periodEnd ?? current?.periodEnd ?? null,
        cancelAtPeriodEnd: true,
        hasSubscription: true,
      }));
      setCancelMessage(
        periodLabel
          ? `Your plan stays active until ${formatPeriodEnd(data.periodEnd) ?? periodLabel}. Billing stops after that.`
          : "Your plan will cancel at the end of the current billing period.",
      );
    } catch (err) {
      setBillingError(
        err instanceof Error ? err.message : "Could not cancel plan.",
      );
    } finally {
      setCancelBusy(false);
    }
  };

  const billingBody = (
    <>
      <div className="px-4 py-4">
        <h3 className="text-[1.35rem] font-medium tracking-[-0.03em]">
          {planLabel(entitlements.plan)}
        </h3>
        {paidPlan && periodLabel ? (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {cancelScheduled
              ? `Active until ${periodLabel}${
                  remainingDays != null && remainingDays > 0
                    ? ` (${remainingDays} day${remainingDays === 1 ? "" : "s"} left)`
                    : ""
                }. Billing ends at the end of this period.`
              : `Renews on ${periodLabel}. Cancel anytime — billing runs through the end of the month.`}
          </p>
        ) : null}
      </div>

      {showCancel ? (
        <div className="border-t border-border px-4 py-4">
          <p className="text-[13px] font-medium tracking-[-0.01em]">
            {cancelScheduled ? "Cancellation scheduled" : "Cancel plan"}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {cancelScheduled
              ? "You can delete your account after your plan ends. Until then, Pro/Max features stay available."
              : "Canceling keeps your plan active through the end of the current billing period. You can delete your account once billing has ended."}
          </p>
          {!cancelScheduled ? (
            <button
              type="button"
              disabled={cancelBusy}
              onClick={() => void cancelPlan()}
              className="mt-4 inline-flex h-10 items-center rounded-full border border-foreground/15 px-5 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted disabled:opacity-50"
            >
              {cancelBusy
                ? "Canceling…"
                : nativeShell
                  ? "Cancel on the web"
                  : "Cancel at period end"}
            </button>
          ) : null}
        </div>
      ) : null}

      {cancelMessage ? (
        <p className="px-4 pb-4 text-[12.5px] text-muted-foreground">
          {cancelMessage}
        </p>
      ) : null}
      {billingError ? (
        <p className="px-4 pb-4 text-[12.5px] text-destructive">{billingError}</p>
      ) : null}
    </>
  );

  if (nativeShell) {
    return (
      <SettingsPage>
        <SettingsHeader kicker="Plan" title="Your plan" />
        <SettingsSection title="Current plan" className="mt-8">
          <SettingsGroup>{billingBody}</SettingsGroup>
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
            Upgrades and cancellations open in Safari — not in-app purchase.
          </p>
        </SettingsSection>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage>
      <SettingsHeader
        kicker="Plan"
        title="Your plan"
        subtitle="Account status for this seat. Cancel anytime — billing runs through the end of your current period."
      />

      {showDemoPicker ? (
        <div className="mt-8">
          <PreviewAccount />
        </div>
      ) : null}

      <SettingsSection title="Current plan" className="mt-8">
        <SettingsGroup>{billingBody}</SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
