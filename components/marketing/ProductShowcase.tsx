"use client";

import { useState } from "react";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { cn } from "@/lib/utils";

const modes = [
  {
    id: "home",
    label: "Explore",
    title: "Chat",
    body: "For questions, research, and handing tasks into Create.",
    variant: "hero" as const,
  },
  {
    id: "build",
    label: "Create",
    title: "Create",
    body: "Apps, sites, automations, and images with live preview and playground.",
    variant: "build" as const,
  },
];

export function ProductShowcase() {
  const [active, setActive] = useState(modes[0].id);
  const mode = modes.find((item) => item.id === active) ?? modes[0];

  return (
    <div className="mt-10">
      <div
        role="tablist"
        aria-label="Product modes"
        className="inline-flex rounded-full border border-border bg-muted/40 p-1"
      >
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            onClick={() => setActive(item.id)}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors",
              active === item.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.03em] md:text-3xl">
            {mode.title}
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            {mode.body}
          </p>
        </div>
        <ProductMockup variant={mode.variant} />
      </div>
    </div>
  );
}
