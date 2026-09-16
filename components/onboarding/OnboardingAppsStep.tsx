"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  claimConnectorOAuthSession,
  fetchConnectorCatalog,
  fetchConnectorConnections,
  initiateConnectorConnection,
} from "@/lib/api/connector-client";
import {
  patchConnectorConnectionForWorkspace,
  replaceConnectorConnectionsForWorkspace,
  subscribeConnectorConnections,
  getConnectorConnectionsSnapshot,
  getConnectorConnectionsServerSnapshot,
} from "@/lib/connector-connections-store";
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import { openConnectorAuthorizationUrl } from "@/lib/open-connector-oauth";
import { accountsPerAppLimit } from "@/lib/plan-entitlements";
import { canAddAnotherConnectorAccount } from "@/lib/connectors/account-names";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import type { BillingPlan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";

/** Featured Apps for onboarding — must exist in the live catalog. */
const FEATURED_APP_IDS = [
  "gmail",
  "gcal",
  "gdrive",
  "slack",
  "notion",
  "github",
  "linear",
  "gdocs",
] as const;

const APP_BLURBS: Record<string, string> = {
  gmail: "Search, summarize, reply, and let Cander work across your email.",
  gcal: "View your schedule, create events, and let Cander coordinate your time.",
  gdrive: "Find files, summarize docs, and keep work moving across Drive.",
  slack: "Catch up, search conversations, and work across your channels.",
  notion: "Search pages, pull context, and keep notes in sync with Cander.",
  github: "Track issues, PRs, and activity across your repositories.",
  linear: "See what’s next, update issues, and keep projects moving.",
  gdocs: "Read, summarize, and draft across your Google Docs.",
};

type CatalogRow = { id: string; name: string };

export function OnboardingAppsStep({
  workspaceId,
  plan,
  onContinue,
  onSkip,
  busy,
}: {
  workspaceId: string;
  plan: BillingPlan;
  onContinue: () => void;
  onSkip: () => void;
  busy?: boolean;
}) {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const byWorkspace = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );
  const connections = byWorkspace[workspaceId] ?? [];

  const accountLimit = accountsPerAppLimit(plan);

  const featured = useMemo(() => {
    const byId = new Map(catalog.map((row) => [row.id, row]));
    const rows: CatalogRow[] = [];
    for (const id of FEATURED_APP_IDS) {
      const hit = byId.get(id);
      if (hit) rows.push(hit);
    }
    // Fall back to first catalog entries if featured IDs missing.
    if (rows.length === 0) {
      return catalog.slice(0, 8);
    }
    return rows;
  }, [catalog]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const rows = await fetchConnectorConnections(workspaceId);
      replaceConnectorConnectionsForWorkspace(workspaceId, rows);
    } catch {
      // non-fatal
    }
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const items = await fetchConnectorCatalog();
        if (cancelled) return;
        setCatalog(
          items.map((item) => ({
            id: item.id,
            name: item.name || item.id,
          })),
        );
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load Apps.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Resume after OAuth return / tab focus.
  useEffect(() => {
    if (!workspaceId) return;
    const onFocus = () => {
      void claimConnectorOAuthSession({ workspaceId })
        .then(async (claimed) => {
          if (claimed.claimed && claimed.connection) {
            patchConnectorConnectionForWorkspace(
              workspaceId,
              claimed.connection,
            );
            setInfo("App connected.");
          }
          await refresh();
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    onFocus();
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [workspaceId, refresh]);

  // Handle `/?connectors=&result=success` while still in onboarding.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("result") !== "success" && !params.get("connectors")) return;
    void refresh();
    params.delete("result");
    params.delete("connectors");
    const next = params.toString();
    window.history.replaceState(
      {},
      "",
      next ? `${window.location.pathname}?${next}` : window.location.pathname,
    );
  }, [refresh]);

  const connect = async (connectorId: string, forceNew = false) => {
    setError("");
    setInfo("");
    setConnectingId(connectorId);
    try {
      const { authorizationUrl, connection } = await initiateConnectorConnection({
        workspaceId,
        connectorId,
        forceNew,
      });
      patchConnectorConnectionForWorkspace(workspaceId, connection);
      if (authorizationUrl) {
        openConnectorAuthorizationUrl(authorizationUrl, {
          onExternalFinished: () => {
            void claimConnectorOAuthSession({ workspaceId })
              .then(async (claimed) => {
                if (claimed.claimed && claimed.connection) {
                  patchConnectorConnectionForWorkspace(
                    workspaceId,
                    claimed.connection,
                  );
                }
                await refresh();
              })
              .catch(() => undefined);
          },
        });
        setInfo("Finish connecting in the browser that opened, then return here.");
        const started = Date.now();
        const poll = window.setInterval(() => {
          void (async () => {
            try {
              const claimed = await claimConnectorOAuthSession({ workspaceId });
              if (claimed.claimed && claimed.connection) {
                window.clearInterval(poll);
                patchConnectorConnectionForWorkspace(
                  workspaceId,
                  claimed.connection,
                );
                setInfo("App connected.");
                setConnectingId(null);
                return;
              }
            } catch {
              // keep polling
            }
            if (Date.now() - started > 120_000) {
              window.clearInterval(poll);
              setConnectingId(null);
            }
          })();
        }, 2000);
      } else if (isUiConnectedStatus(connection.status)) {
        setInfo("App connected.");
        setConnectingId(null);
      } else {
        setConnectingId(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect App.");
      setConnectingId(null);
    }
  };

  const connectedCount = connections.filter((row) =>
    isUiConnectedStatus(row.status),
  ).length;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-foreground sm:text-[32px]">
          Bring the apps you already use into Cander.
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Connect a few now — or skip and do it anytime from Apps.
        </p>
      </div>

      {error ? (
        <p className="text-[13px] text-destructive">{error}</p>
      ) : null}
      {info ? (
        <p className="text-[13px] text-muted-foreground">{info}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-[14px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          Loading Apps…
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {featured.map((app) => {
            const accounts = connections.filter(
              (row) =>
                row.connectorId === app.id && isUiConnectedStatus(row.status),
            );
            const connected = accounts.length > 0;
            const canAdd = canAddAnotherConnectorAccount(
              accounts.length,
              accountLimit,
            );
            const connecting = connectingId === app.id;

            return (
              <li
                key={app.id}
                className={cn(
                  "flex flex-col gap-3 border border-foreground/10 bg-background/60 px-4 py-3.5",
                  SHELL_G3_RADIUS,
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted/50">
                    <ConnectorMark id={app.id} size="nav" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-medium tracking-[-0.01em]">
                        {app.name}
                      </p>
                      {connected ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-[var(--shell-select)]" strokeWidth={2.4} />
                          Connected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                      {APP_BLURBS[app.id] ??
                        `Let Cander work with ${app.name}.`}
                    </p>
                    {accounts.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {accounts.map((account) => (
                          <li
                            key={account.id}
                            className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[12px] tracking-[-0.01em] dark:bg-white/[0.08]"
                          >
                            {account.displayName || app.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {!connected ? (
                      <button
                        type="button"
                        disabled={Boolean(connectingId) || busy}
                        onClick={() => void connect(app.id)}
                        className={cn(
                          "inline-flex h-9 items-center justify-center gap-1.5 bg-[var(--shell-select)] px-3.5 text-[13px] font-medium text-[var(--shell-select-foreground)] transition-opacity disabled:opacity-50",
                          SHELL_G3_RADIUS,
                        )}
                      >
                        {connecting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Connect
                      </button>
                    ) : canAdd ? (
                      <button
                        type="button"
                        disabled={Boolean(connectingId) || busy}
                        onClick={() => void connect(app.id, true)}
                        className={cn(
                          "inline-flex h-9 items-center justify-center gap-1 border border-foreground/12 px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50",
                          SHELL_G3_RADIUS,
                        )}
                      >
                        {connecting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                        )}
                        Add account
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onContinue}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center bg-[var(--shell-select)] text-[14px] font-medium text-[var(--shell-select-foreground)] transition-opacity disabled:opacity-50",
            SHELL_G3_RADIUS,
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : connectedCount > 0 ? (
            "Enter Cander"
          ) : (
            "Continue"
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
