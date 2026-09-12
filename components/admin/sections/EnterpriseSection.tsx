"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

type EntRow = {
  id: string;
  email: string;
  name: string;
  plan: string;
  ai_minutes_override: number | null;
  ai_minutes_plan: string | null;
};

export function EnterpriseSection() {
  const { fetchJson } = useAdmin();
  const [rows, setRows] = useState<EntRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState("");
  const [plan, setPlan] = useState("enterprise");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void fetchJson<{ accounts: EntRow[] }>("/api/admin/enterprise")
      .then((res) => setRows(res.accounts ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!profileId) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJson("/api/admin/enterprise", {
        method: "PATCH",
        body: JSON.stringify({
          profileId,
          plan,
          aiMinutesPlan: "enterprise",
          aiMinutesOverride: minutes ? Number(minutes) : undefined,
          reason: notes || "Enterprise assign",
          budgetNotes: notes || undefined,
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enterprise roster. Assignments are audited; open period snapshots stay
        unchanged by default.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-[10px] border border-border/60 p-4 space-y-2">
        <h2 className="text-sm font-medium">Assign / override</h2>
        <input
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          placeholder="Profile id"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {["enterprise", "ultra", "max", "pro", "free"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Minutes override"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Budget notes / reason"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={saving || !profileId}
          className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background disabled:opacity-40"
          onClick={() => void save()}
        >
          Save
        </button>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border/60">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Override</th>
              <th className="px-3 py-2">Meter plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-b border-border/40 hover:bg-muted/30"
                onClick={() => setProfileId(r.id)}
              >
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.email}
                  </div>
                </td>
                <td className="px-3 py-2">{r.plan}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.ai_minutes_override ?? "—"}
                </td>
                <td className="px-3 py-2">{r.ai_minutes_plan ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
