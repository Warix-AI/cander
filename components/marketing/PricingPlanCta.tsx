"use client";

import { Cta } from "@/components/marketing/Cta";
import { APP_HREF } from "@/lib/marketing";
import {
  LIMITLESS_CONTACT_HREF,
  isSelfServePlan,
} from "@/lib/billing/plan-catalog";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { BillingPlan } from "@/lib/types";
import { useState } from "react";

const checkoutBtnClass =
  "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-foreground/15 bg-transparent px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200 hover:bg-muted disabled:opacity-50";

const checkoutBtnPrimaryClass =
  "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground transition-colors duration-200 hover:bg-foreground disabled:opacity-50";

type Props = {
  plan: BillingPlan;
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
};

export function PricingPlanCta({
  plan,
  label,
  variant = "secondary",
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  if (plan === "minimal") {
    return (
      <Cta href={APP_HREF} className={className} variant={variant}>
        {label}
      </Cta>
    );
  }

  if (!isSelfServePlan(plan)) {
    return (
      <Cta
        href={LIMITLESS_CONTACT_HREF}
        className={className}
        variant={variant}
      >
        {label}
      </Cta>
    );
  }

  const startCheckout = async () => {
    if (!isSupabaseConfigured()) {
      window.location.href = `${APP_HREF}?plan=${plan}`;
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = `${APP_HREF}?plan=${plan}`;
        return;
      }

      // Simulated fixed-plan subscribe until Polar product IDs are wired.
      const response = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        window.location.href = `${APP_HREF}?settings=plans`;
        return;
      }

      throw new Error(
        typeof data.error === "string" ? data.error : "Checkout failed.",
      );
    } catch {
      window.location.href = `${APP_HREF}?plan=${plan}`;
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void startCheckout()}
      className={cn(
        variant === "primary" ? checkoutBtnPrimaryClass : checkoutBtnClass,
        className,
      )}
    >
      {busy ? "Saving…" : label}
    </button>
  );
}
