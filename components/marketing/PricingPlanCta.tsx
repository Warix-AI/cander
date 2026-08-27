"use client";

import { useState } from "react";
import Link from "next/link";
import { Cta } from "@/components/marketing/Cta";
import { APP_HREF } from "@/lib/marketing";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { BillingPlan } from "@/lib/types";

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

  if (plan === "free") {
    return (
      <Cta href={APP_HREF} className={className} variant={variant}>
        {label}
      </Cta>
    );
  }

  const startCheckout = async () => {
    if (!isSupabaseConfigured()) {
      window.location.href = APP_HREF;
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

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan, returnTo: "settings" }),
      });
      const data = await response.json();

      if (data.bypass) {
        window.location.href = `${APP_HREF}?settings=plans`;
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error ?? "Checkout failed.");
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
      {busy ? "Opening checkout…" : label}
    </button>
  );
}

