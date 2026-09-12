"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  created_at: string;
};

export function AuditSection() {
  const { fetchJson } = useAdmin();
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<{ entries: AuditRow[] }>("/api/admin/audit?limit=100")
      .then((res) => setEntries(res.entries ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Append-only platform admin audit log.
      </p>
      <div className="overflow-x-auto rounded-[10px] border border-border/60">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border/40">
                <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-medium">{e.action}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {e.target_type}
                  {e.target_id ? ` · ${e.target_id}` : ""}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {e.reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!entries.length ? (
        <p className="text-sm text-muted-foreground">No audit entries yet.</p>
      ) : null}
    </div>
  );
}
