import { pricingFaqs } from "@/lib/billing";

export function FaqList({
  items = pricingFaqs,
}: {
  items?: { q: string; a: string }[];
}) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <details key={item.q} className="group py-4">
          <summary className="cursor-pointer text-[15px] font-medium tracking-[-0.02em]">
            {item.q}
          </summary>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
