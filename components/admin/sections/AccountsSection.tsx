"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

type AccountRow = {
  id: string;
  email: string;
  name: string;
  plan: string;
  subscription_status: string;
  ai_minutes_override: number | null;
  ai_minutes_plan: string | null;
};

export function AccountsSection() {
  const {
    fetchJson,
    selectedAccountId,
    setSelectedAccountId,
    setSection,
  } = useAdmin();
  const [q, setQ] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideMinutes, setOverrideMinutes] = useState("");
  const [overridePlan, setOverridePlan] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void fetchJson<{ accounts: AccountRow[] }>(
      `/api/admin/accounts?q=${encodeURIComponent(q)}&limit=50`,
    )
      .then((res) => setAccounts(res.accounts ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedAccountId) {
      setDetail(null);
      return;
    }
    void fetchJson<{
      account: AccountRow;
      billing: Record<string, unknown>;
      overrides: unknown[];
    }>(`/api/admin/accounts/${selectedAccountId}`)
      .then((res) => setDetail(res as unknown as Record<string, unknown>))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load detail"),
      );
  }, [fetchJson, selectedAccountId]);

  async function applyOverride() {
    if (!selectedAccountId) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJson(`/api/admin/accounts/${selectedAccountId}`, {
        method: "POST",
        body: JSON.stringify({
          aiMinutesOverride: overrideMinutes
            ? Number(overrideMinutes)
            : undefined,
          aiMinutesPlan: overridePlan || undefined,
          reason: reason || "Admin Accounts UI",
        }),
      });
      setReason("");
      const res = await fetchJson<{
        account: AccountRow;
        billing: Record<string, unknown>;
      }>(`/api/admin/accounts/${selectedAccountId}`);
      setDetail(res as unknown as Record<string, unknown>);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email or name"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="rounded-full bg-foreground px-4 py-2 text-xs text-background"
          onClick={load}
        >
          Search
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-[10px] border border-border/60">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Sub</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer border-b border-border/40 hover:bg-muted/40"
                  onClick={() => setSelectedAccountId(a.id)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.name || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.email}
                    </div>
                  </td>
                  <td className="px-3 py-2">{a.plan}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {a.subscription_status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-[10px] border border-border/60 p-4">
          {!selectedAccountId || !detail ? (
            <p className="text-sm text-muted-foreground">
              Select an account for detail, overrides, and billing.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2 text-[11px]">
                {JSON.stringify(detail, null, 2)}
              </pre>
              <p className="text-[11px] text-muted-foreground">
                Open period snapshots are unchanged by override writes.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Override minutes"
                  value={overrideMinutes}
                  onChange={(e) => setOverrideMinutes(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                <select
                  value={overridePlan}
                  onChange={(e) => setOverridePlan(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">Metering plan…</option>
                  {["free", "pro", "max", "ultra", "enterprise"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <input
                placeholder="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background disabled:opacity-40"
                  onClick={() => void applyOverride()}
                >
                  Apply override
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-xs"
                  onClick={() => setSection("usage")}
                >
                  Open usage
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
