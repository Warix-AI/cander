"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

export function UsageSection() {
  const { fetchJson, selectedAccountId, setSelectedAccountId } = useAdmin();
  const [periods, setPeriods] = useState<unknown[]>([]);
  const [aggregates, setAggregates] = useState<unknown[]>([]);
  const [events, setEvents] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState(selectedAccountId ?? "");

  useEffect(() => {
    if (selectedAccountId) setProfileId(selectedAccountId);
  }, [selectedAccountId]);

  const load = useCallback(() => {
    const q = profileId
      ? `?profileId=${encodeURIComponent(profileId)}&limit=50`
      : "?limit=50";
    setError(null);
    void Promise.all([
      fetchJson<{ periods: unknown[] }>(`/api/admin/usage/periods${q}`),
      fetchJson<{ aggregates: unknown[] }>(`/api/admin/usage/aggregates${q}`),
      fetchJson<{ events: unknown[]; note?: string }>(
        `/api/admin/usage/events${q}`,
      ),
    ])
      .then(([p, a, e]) => {
        setPeriods(p.periods ?? []);
        setAggregates(a.aggregates ?? []);
        setEvents(e.events ?? []);
        if (profileId) setSelectedAccountId(profileId);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson, profileId, setSelectedAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function rebuild() {
    if (!profileId) return;
    try {
      await fetchJson("/api/admin/usage/aggregates", {
        method: "POST",
        body: JSON.stringify({
          profileId,
          reason: "Admin Usage UI rebuild",
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Period → aggregate → events. Snapshot included_minutes may differ from
        live plan configs. subscription_id on events is often empty.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          placeholder="Profile id"
          className="min-w-[16rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="rounded-full bg-foreground px-4 py-2 text-xs text-background"
          onClick={load}
        >
          Load
        </button>
        <button
          type="button"
          className="rounded-full border border-border px-4 py-2 text-xs"
          onClick={() => void rebuild()}
          disabled={!profileId}
        >
          Rebuild aggregate
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Section title={`Periods (${periods.length})`} rows={periods} />
      <Section title={`Aggregates (${aggregates.length})`} rows={aggregates} />
      <Section title={`Events (${events.length})`} rows={events} />
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: unknown[] }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <div className="max-h-64 overflow-auto rounded-[10px] border border-border/60">
        {rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No rows</p>
        ) : (
          <pre className="p-3 text-[11px] leading-relaxed">
            {JSON.stringify(rows.slice(0, 25), null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
