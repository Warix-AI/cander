"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

export function OperationsSection() {
  const { fetchJson } = useAdmin();
  const [data, setData] = useState<{
    orphans: unknown[];
    failed: unknown[];
    overMinuteAccounts: unknown[];
    notes: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebuildId, setRebuildId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void fetchJson<{
      orphans: unknown[];
      failed: unknown[];
      overMinuteAccounts: unknown[];
      notes: string[];
    }>("/api/admin/operations")
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  async function closeOrphans() {
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/admin/operations", {
        method: "POST",
        body: JSON.stringify({
          action: "close_orphans",
          maxAgeHours: 2,
          reason: "Admin Operations UI",
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setBusy(false);
    }
  }

  async function rebuild() {
    if (!rebuildId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/admin/operations", {
        method: "POST",
        body: JSON.stringify({
          action: "rebuild_aggregate",
          profileId: rebuildId,
          reason: "Admin Operations UI",
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Reconciliation candidates and idempotent ops. Actions are audited.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-full bg-foreground px-4 py-2 text-xs text-background disabled:opacity-40"
          onClick={() => void closeOrphans()}
        >
          Close orphan running events
        </button>
        <input
          value={rebuildId}
          onChange={(e) => setRebuildId(e.target.value)}
          placeholder="Profile id to rebuild"
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
        />
        <button
          type="button"
          disabled={busy || !rebuildId}
          className="rounded-full border border-border px-4 py-2 text-xs disabled:opacity-40"
          onClick={() => void rebuild()}
        >
          Rebuild aggregate
        </button>
      </div>

      <ul className="space-y-1 text-[11px] text-muted-foreground">
        {data.notes.map((n) => (
          <li key={n}>· {n}</li>
        ))}
      </ul>

      <Block title={`Orphans (${data.orphans.length})`} rows={data.orphans} />
      <Block title={`Failed (${data.failed.length})`} rows={data.failed} />
      <Block
        title={`Over minutes (${data.overMinuteAccounts.length})`}
        rows={data.overMinuteAccounts}
      />
    </div>
  );
}

function Block({ title, rows }: { title: string; rows: unknown[] }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <div className="max-h-56 overflow-auto rounded-[10px] border border-border/60">
        <pre className="p-3 text-[11px]">
          {rows.length ? JSON.stringify(rows.slice(0, 30), null, 2) : "None"}
        </pre>
      </div>
    </div>
  );
}
