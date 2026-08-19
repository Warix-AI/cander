import { Check } from "lucide-react";
import { Cta } from "@/components/marketing/Cta";
import { APP_HREF } from "@/lib/marketing";
import { courierPlans, money, type CompareValue } from "@/lib/billing";
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
        plan.popular ? "border-foreground" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {plan.audience}
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
            {plan.name}
          </h3>
        </div>
        {plan.popular ? (
          <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-background">
            Most Popular
          </span>
        ) : null}
      </div>
      <p className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-medium tracking-[-0.04em]">
          {money(plan.price)}
        </span>
        <span className="text-[13px] text-muted-foreground">/ user / month</span>
      </p>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        {plan.blurb}
      </p>
      {plan.includes ? (
        <p className="mt-5 text-[12.5px] font-medium text-muted-foreground">
          {plan.includes}
        </p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2">
        {plan.points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[13.5px]">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {point}
          </li>
        ))}
      </ul>
      <Cta href={APP_HREF} className="mt-8 w-full" variant={plan.popular ? "primary" : "secondary"}>
        {plan.cta}
      </Cta>
    </article>
  );
}

export function PricingCards() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {courierPlans.map((plan) => (
        <PricingCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

export function CompareCell({ value }: { value: CompareValue }) {
  if (value === true) {
    return (
      <Check
        className="mx-auto h-4 w-4"
        strokeWidth={2}
        aria-label="Included"
      />
    );
  }
  if (value === false) {
    return (
      <span className="block text-center text-muted-foreground/40" aria-label="Not included">
        —
      </span>
    );
  }
  return <span className="text-[12.5px] text-muted-foreground">{value}</span>;
}
