"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";

type PlanRow = {
  planId: string;
  label: string;
  includedMinutes: number;
  minimumMinutes: number | null;
  maximumMinutes: number | null;
  minutesStep: number;
  internalBudgetUsd: number;
  usageLimitBehavior: string;
  active: boolean;
};

export function PlansSection() {
  const { fetchJson } = useAdmin();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PlanRow>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void fetchJson<{ plans: PlanRow[]; note?: string }>(
      "/api/admin/ai-minutes-plans",
    )
      .then((res) => {
        setPlans(res.plans ?? []);
        setNote(res.note ?? "");
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJson("/api/admin/ai-minutes-plans", {
        method: "PATCH",
        body: JSON.stringify({
          planId: editing,
          includedMinutes: draft.includedMinutes,
          minimumMinutes: draft.minimumMinutes,
          maximumMinutes: draft.maximumMinutes,
          minutesStep: draft.minutesStep,
          internalBudgetUsd: draft.internalBudgetUsd,
          usageLimitBehavior: draft.usageLimitBehavior,
          active: draft.active,
          reason: "Admin Plans UI",
        }),
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (error && !plans.length) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Affects <strong>new</strong> billing periods only. Open periods keep
        their included_minutes snapshot.
      </p>
      {note ? (
        <p className="text-[11px] text-muted-foreground">{note}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto rounded-[10px] border border-border/60">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Included</th>
              <th className="px-3 py-2 font-medium">Min / Max</th>
              <th className="px-3 py-2 font-medium">Step</th>
              <th className="px-3 py-2 font-medium">Budget $</th>
              <th className="px-3 py-2 font-medium">Limit</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const isEdit = editing === p.planId;
              return (
                <tr key={p.planId} className="border-b border-border/40">
                  <td className="px-3 py-2 font-medium">{p.label}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {isEdit ? (
                      <input
                        type="number"
                        className="w-20 rounded border border-border bg-background px-1 py-0.5"
                        value={draft.includedMinutes ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            includedMinutes: Number(e.target.value),
                          }))
                        }
                      />
                    ) : (
                      p.includedMinutes
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {isEdit ? (
                      <span className="flex gap-1">
                        <input
                          type="number"
                          className="w-16 rounded border border-border bg-background px-1 py-0.5"
                          value={draft.minimumMinutes ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              minimumMinutes: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }))
                          }
                        />
                        <input
                          type="number"
                          className="w-16 rounded border border-border bg-background px-1 py-0.5"
                          value={draft.maximumMinutes ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              maximumMinutes: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }))
                          }
                        />
                      </span>
                    ) : (
                      `${p.minimumMinutes ?? "—"} / ${p.maximumMinutes ?? "∞"}`
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {isEdit ? (
                      <input
                        type="number"
                        className="w-16 rounded border border-border bg-background px-1 py-0.5"
                        value={draft.minutesStep ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            minutesStep: Number(e.target.value),
                          }))
                        }
                      />
                    ) : (
                      p.minutesStep
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {isEdit ? (
                      <input
                        type="number"
                        className="w-20 rounded border border-border bg-background px-1 py-0.5"
                        value={draft.internalBudgetUsd ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            internalBudgetUsd: Number(e.target.value),
                          }))
                        }
                      />
                    ) : (
                      p.internalBudgetUsd
                    )}
                  </td>
                  <td className="px-3 py-2">{p.usageLimitBehavior}</td>
                  <td className="px-3 py-2 text-right">
                    {isEdit ? (
                      <span className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          className="text-xs font-medium"
                          onClick={() => void save()}
                        >
                          Save
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditing(p.planId);
                          setDraft(p);
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
