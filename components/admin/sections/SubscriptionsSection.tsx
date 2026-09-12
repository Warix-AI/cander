"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

type SubRow = {
  id: string;
  email: string;
  name: string;
  plan: string;
  subscription_status: string;
  subscription_period_end: string | null;
  provider: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export function SubscriptionsSection() {
  const { fetchJson } = useAdmin();
  const [rows, setRows] = useState<SubRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<{
      subscriptions: SubRow[];
      billingProviderMessage?: string;
    }>("/api/admin/subscriptions")
      .then((res) => {
        setRows(res.subscriptions ?? []);
        setMessage(res.billingProviderMessage ?? "");
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Cander-known subscription state. Stripe fields are read-only here.{" "}
        {message || "Billing provider not connected (Polar)."}
      </p>
      <p className="text-[11px] text-muted-foreground">
        subscription_period_end is Stripe period; usage periods are calendar
        months.
      </p>
      <div className="overflow-x-auto rounded-[10px] border border-border/60">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Period end</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.email}
                  </div>
                </td>
                <td className="px-3 py-2">{r.plan}</td>
                <td className="px-3 py-2">{r.subscription_status}</td>
                <td className="px-3 py-2">{r.provider}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.subscription_period_end
                    ? new Date(r.subscription_period_end).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">No subscriptions found.</p>
      ) : null}
    </div>
  );
}
