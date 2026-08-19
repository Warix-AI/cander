import Link from "next/link";
import { Check } from "lucide-react";
import { Cta } from "@/components/marketing/Cta";
import { APP_HREF } from "@/lib/marketing";
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
      <h3 className="text-lg font-medium tracking-[-0.02em]">{plan.name}</h3>
      <p className="mt-1 text-[13.5px] text-muted-foreground">{plan.blurb}</p>
      <p className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-medium tracking-[-0.03em]">
          {money(plan.price)}
        </span>
        <span className="text-[13px] text-muted-foreground">USD / month</span>
      </p>
      {plan.popular ? (
        <p className="mt-2 text-[12px] font-medium text-muted-foreground">
          Most popular
        </p>
      ) : null}
      <Cta
        href={APP_HREF}
        className="mt-6 w-full"
        variant={plan.popular ? "primary" : "secondary"}
      >
        {plan.cta}
      </Cta>
      {plan.includes ? (
        <p className="mt-6 text-[12px] font-medium text-muted-foreground">
          {plan.includes}
        </p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2.5">
        {plan.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-[13.5px]">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} />
            {point}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function PricingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {courierPlans.map((plan) => (
        <PricingCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

export function CompareCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 opacity-80" strokeWidth={2} aria-label="Included" />;
  }
  if (value === false) {
    return <span className="block text-center text-muted-foreground/35">—</span>;
  }
  return <span className="text-[12.5px] text-muted-foreground">{value}</span>;
}
