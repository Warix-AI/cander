"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

type Summary = {
  totalAccounts: number;
  accountsByPlan: Record<string, number>;
  activeSubscriptions: number;
  enterpriseAccounts: number;
  openPeriodsThisMonth: number;
  orphanRunningEvents: number;
  failedEventsThisMonth: number;
  notes: string[];
};

export function OverviewSection() {
  const { fetchJson } = useAdmin();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ summary: Summary }>("/api/admin/summary")
      .then((res) => {
        if (!cancelled) setSummary(res.summary);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchJson]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!summary) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const metrics = [
    { label: "Accounts", value: summary.totalAccounts },
    { label: "Active subs", value: summary.activeSubscriptions },
    { label: "Enterprise", value: summary.enterpriseAccounts },
    { label: "Open periods (month)", value: summary.openPeriodsThisMonth },
    { label: "Orphan running", value: summary.orphanRunningEvents },
    { label: "Failed events (month)", value: summary.failedEventsThisMonth },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-[10px] border border-border/60 px-4 py-3"
          >
            <div className="text-[11px] text-muted-foreground">{m.label}</div>
            <div className="mt-1 text-2xl font-medium tabular-nums">
              {m.value}
            </div>
          </div>
        ))}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium">Accounts by plan</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.accountsByPlan).map(([plan, count]) => (
            <span
              key={plan}
              className="rounded-full border border-border/60 px-3 py-1 text-xs"
            >
              {plan}: {count}
            </span>
          ))}
        </div>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {summary.notes.map((n) => (
          <li key={n}>· {n}</li>
        ))}
      </ul>
    </div>
  );
}
