"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { PricingPlanCta } from "@/components/marketing/PricingPlanCta";
import { courierPlans, money } from "@/lib/billing";
import { cn } from "@/lib/utils";

export function PricingCard({
  plan,
}: {
  plan: (typeof courierPlans)[number];
}) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-[10px] border bg-card p-6",
        plan.popular ? "border-foreground/30" : "border-border",
      )}
    >
      <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
        {plan.audience}
      </p>
      <h3 className="mt-1 text-lg font-medium tracking-[-0.02em]">{plan.name}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        {plan.blurb}
      </p>
      <p className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-medium tracking-[-0.03em]">
          {money(plan.price)}
        </span>
        {plan.price > 0 ? (
          <span className="text-[13px] text-muted-foreground">USD / month</span>
        ) : null}
      </p>
      {plan.popular ? (
        <p className="mt-2 text-[12px] font-medium text-muted-foreground">
          Most popular
        </p>
      ) : null}
      <PricingPlanCta
        plan={plan.id}
        label={plan.cta}
        className="mt-6 w-full"
        variant={plan.popular ? "primary" : "secondary"}
      />
    </article>
  );
}

export function PricingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courierPlans.map((plan) => (
        <PricingCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

/** Pricing table cell — strictly included (✓) or not (×). */
export function CompareCell({ included }: { included: boolean }) {
  if (included) {
    return (
      <Check
        className="mx-auto h-4 w-4 opacity-80"
        strokeWidth={2}
        aria-label="Included"
      />
    );
  }
  return (
    <X
      className="mx-auto h-4 w-4 text-muted-foreground/35"
      strokeWidth={2}
      aria-label="Not included"
    />
  );
}
