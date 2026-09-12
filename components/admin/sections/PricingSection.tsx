"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/AdminProvider";
import {
  previewPriceForMinutes,
  type PricingPlanRow,
} from "@/lib/admin/pricing-types";

export function PricingSection() {
  const { fetchJson } = useAdmin();
  const [plans, setPlans] = useState<PricingPlanRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] = useState<string>("pro");
  const [previewMinutes, setPreviewMinutes] = useState(50);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PricingPlanRow>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void fetchJson<{ plans: PricingPlanRow[] }>("/api/admin/pricing")
      .then((res) => setPlans(res.plans ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => plans.find((p) => p.planId === previewPlan) ?? plans[0],
    [plans, previewPlan],
  );

  const previewPrice = selected
    ? previewPriceForMinutes(selected, previewMinutes)
    : 0;

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await fetchJson("/api/admin/pricing", {
        method: "PATCH",
        body: JSON.stringify({
          planId: editing,
          ...draft,
          reason: "Admin Pricing UI",
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
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Provider-independent pricing SoT. Billing provider not connected (Polar).
        Affects <strong>new</strong> periods for minute-related fields.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-[10px] border border-border/60 p-4">
        <h2 className="mb-3 text-sm font-medium">Slider preview</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Plan
            <select
              className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5"
              value={selected?.planId ?? "pro"}
              onChange={(e) => {
                setPreviewPlan(e.target.value);
                const p = plans.find((x) => x.planId === e.target.value);
                if (p) setPreviewMinutes(p.includedMinutes);
              }}
            >
              {plans.map((p) => (
                <option key={p.planId} value={p.planId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <label className="min-w-[12rem] flex-1 text-xs">
              Minutes: {previewMinutes}
              <input
                type="range"
                className="mt-1 block w-full"
                min={selected.minimumMinutes ?? 0}
                max={selected.maximumMinutes ?? selected.includedMinutes * 2}
                step={selected.minutesStep || 1}
                value={previewMinutes}
                onChange={(e) => setPreviewMinutes(Number(e.target.value))}
              />
            </label>
          ) : null}
          <div className="text-lg font-medium tabular-nums">
            ${previewPrice.toFixed(2)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / mo
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border/60">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Minutes</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Public</th>
              <th className="px-3 py-2">Self-serve</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const isEdit = editing === p.planId;
              return (
                <tr key={p.planId} className="border-b border-border/40">
                  <td className="px-3 py-2 font-medium">{p.displayName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {isEdit ? (
                      <input
                        type="number"
                        className="w-20 rounded border border-border bg-background px-1"
                        value={draft.baseMonthlyPriceUsd ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            baseMonthlyPriceUsd: Number(e.target.value),
                          }))
                        }
                      />
                    ) : (
                      `$${p.baseMonthlyPriceUsd}`
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {isEdit ? (
                      <input
                        type="number"
                        className="w-20 rounded border border-border bg-background px-1"
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
                  <td className="px-3 py-2">{p.pricingMode}</td>
                  <td className="px-3 py-2">{p.isPublic ? "yes" : "no"}</td>
                  <td className="px-3 py-2">{p.isSelfServe ? "yes" : "no"}</td>
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
