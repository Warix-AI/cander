"use client";

/**
 * Project settings: database status ("Connect database") and keys & settings
 * (env vars). Names only — values are write-only and never shown again.
 * Shared by the mobile actions sheet and the desktop header popover.
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type EnvVarRow = { name: string; scope: string; secret: boolean; liveSyncedAt: string | null };
type DbStatus = "not_created" | "pending" | "ready" | "error" | "skipped" | "unknown";

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await createSupabaseBrowserClient().auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
}

export function ProjectSettingsPane({
  projectId,
  workspaceId,
  projectKind,
}: {
  projectId: string;
  workspaceId: string;
  projectKind: string | null | undefined;
}) {
  const [vars, setVars] = useState<EnvVarRow[] | null>(null);
  const [vaultReady, setVaultReady] = useState(true);
  const [db, setDb] = useState<DbStatus>("unknown");
  const [dbBusy, setDbBusy] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isApp = String(projectKind ?? "").toLowerCase() === "app";

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const q = `workspaceId=${encodeURIComponent(workspaceId)}`;
    const [envRes, dbRes] = await Promise.all([
      fetch(`/api/projects/${encodeURIComponent(projectId)}/env?${q}`, { headers }),
      isApp ? fetch(`/api/projects/${encodeURIComponent(projectId)}/supabase?${q}`, { headers }) : Promise.resolve(null),
    ]);
    if (envRes.ok) {
      const data = (await envRes.json()) as { vars?: EnvVarRow[]; vaultConfigured?: boolean };
      setVars(data.vars ?? []);
      setVaultReady(data.vaultConfigured !== false);
    } else {
      setVars([]);
    }
    if (dbRes?.ok) {
      const data = (await dbRes.json()) as { status?: string };
      setDb((data.status as DbStatus) ?? "unknown");
    }
  }, [isApp, projectId, workspaceId]);

  useEffect(() => {
    // Fetch after mount; state updates land in the fetch callbacks.
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const connectDb = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers || dbBusy) return;
    setDbBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/supabase`, {
        method: "POST",
        headers,
        body: JSON.stringify({ workspaceId }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (!res.ok) setNote(data.error || "Could not connect the database right now.");
      setDb((data.status as DbStatus) ?? "pending");
    } finally {
      setDbBusy(false);
    }
  }, [dbBusy, projectId, workspaceId]);

  const save = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/env`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ workspaceId, name: name.trim(), value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote(data.error || "Could not save that setting.");
        return;
      }
      setName("");
      setValue("");
      setNote("Saved. It reaches the preview on its next start and the live site on the next publish.");
      await load();
    } finally {
      setBusy(false);
    }
  }, [busy, load, name, projectId, value, workspaceId]);

  const remove = useCallback(
    async (row: EnvVarRow) => {
      const headers = await authHeaders();
      if (!headers) return;
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/env`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ workspaceId, name: row.name, scope: row.scope }),
      });
      await load();
    },
    [load, projectId, workspaceId],
  );

  const dbLabel: Record<DbStatus, string> = {
    not_created: "Not connected",
    pending: "Setting up…",
    ready: "Connected",
    error: "Needs attention",
    skipped: "Not needed for websites",
    unknown: "Checking…",
  };

  return (
    <div className="space-y-6">
      {isApp ? (
        <section>
          <p className="text-[13px] font-medium">Database</p>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  db === "ready" ? "bg-emerald-500" : db === "error" ? "bg-red-500" : "bg-muted-foreground/50",
                )}
              />
              <p className="text-[13px]">{dbLabel[db]}</p>
            </div>
            {db !== "ready" && db !== "skipped" ? (
              <button
                type="button"
                disabled={dbBusy}
                onClick={() => void connectDb()}
                className="h-8 rounded-full bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-50"
              >
                {dbBusy ? "Connecting…" : "Connect database"}
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            Your app gets its own database with secure access rules. Cander wires the connection into the preview and the live site.
          </p>
        </section>
      ) : null}

      <section>
        <p className="text-[13px] font-medium">Keys &amp; settings</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          API keys and configuration your site needs (payments, email, maps…). Values are stored securely and never shown again.
        </p>
        <div className="mt-2 space-y-1.5">
          {vars === null ? (
            <p className="text-[12px] text-muted-foreground">Loading…</p>
          ) : vars.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Nothing added yet.</p>
          ) : (
            vars.map((row) => (
              <div key={`${row.name}:${row.scope}`} className="flex items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="truncate font-mono text-[12.5px]">{row.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{row.secret ? "secret" : "public"}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => void remove(row)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            placeholder="NAME (e.g. STRIPE_SECRET_KEY)"
            aria-label="Setting name"
            className="h-10 w-full rounded-[10px] border border-border bg-muted/30 px-3 font-mono text-[12.5px] outline-none"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value"
            type="password"
            autoComplete="off"
            aria-label="Setting value"
            className="h-10 w-full rounded-[10px] border border-border bg-muted/30 px-3 text-[13px] outline-none"
          />
          <button
            type="button"
            disabled={busy || !name.trim() || !value || (!vaultReady && !name.startsWith("NEXT_PUBLIC_"))}
            onClick={() => void save()}
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-foreground text-[13px] font-medium text-background disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add setting"}
          </button>
          {!vaultReady ? (
            <p className="text-[12px] text-muted-foreground">Secret storage isn’t set up on this server yet — only public settings can be added.</p>
          ) : null}
          {note ? <p className="text-[12px] leading-relaxed text-muted-foreground">{note}</p> : null}
        </div>
      </section>
    </div>
  );
}
