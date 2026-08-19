"use client";

import { Kpi } from "@/components/platform/Charts";

export type StatItem = {
  label: string;
  value: string;
  delta?: string;
};

export function StatsBanner({ stats }: { stats: StatItem[] }) {
  return (
    <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
      {stats.map((stat) => (
        <Kpi
          key={stat.label}
          label={stat.label}
          value={stat.value}
          delta={stat.delta}
        />
      ))}
    </div>
  );
}
