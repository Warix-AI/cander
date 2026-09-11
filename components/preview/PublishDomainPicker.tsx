"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import {
  buildPublishDomainOptions,
  isValidDomain,
  normalizeCustomDomain,
  type PublishDomainOption,
} from "@/lib/publish-domain";
import { useSpaceMutation, useSpaceProject } from "@/lib/hooks/use-space-query";
import { cn } from "@/lib/utils";
import { notifyEntityStoreChange } from "@/lib/api/space-entity-store";

export function usePublishDomainOptions() {
  const { liveUrl, project, projectId } = useApp();
  const { project: entityProject } = useSpaceProject(projectId);
  const displayName = entityProject?.title ?? project?.name ?? "app";
  const domains = entityProject?.domains ?? project?.domains ?? [];
  // Prefer allocated infra subdomain when present on published_url host.
  const subdomainFromUrl = (() => {
    const raw = entityProject?.publishedUrl || liveUrl;
    if (!raw) return null;
    try {
      const host = new URL(raw).hostname.toLowerCase();
      if (host.endsWith(".cander.app") && !host.startsWith("draft--")) {
        return host.slice(0, -".cander.app".length);
      }
    } catch {
      return null;
    }
    return null;
  })();

  return useMemo(
    () =>
      buildPublishDomainOptions({
        displayName,
        subdomain: subdomainFromUrl,
        domains,
        liveUrl: entityProject?.publishedUrl ?? liveUrl,
      }),
    [displayName, domains, liveUrl, entityProject?.publishedUrl, subdomainFromUrl],
  );
}

export function PublishDomainPicker({
  options,
  selected,
  onSelect,
  className,
}: {
  options: PublishDomainOption[];
  selected: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {options.map((item) => {
        const on = selected === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left",
              on ? "border-foreground/25 bg-muted" : "border-border",
            )}
          >
            <span
              className={cn(
                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                on
                  ? "border-foreground bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {on ? <Check className="h-2.5 w-2.5" strokeWidth={2.4} /> : null}
            </span>
            <span>
              <span className="block font-mono text-[13px]">{item.label}</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                {item.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Add and manage custom domains on a Build project. */
export function ProjectDomainsManager({ compact = false }: { compact?: boolean }) {
  const { project, projectId } = useApp();
  const { project: entityProject } = useSpaceProject(projectId);
  const { updateProject } = useSpaceMutation();
  const ctx = useWorkspaceCtx();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [domainState, setDomainState] = useState<{
    domain: string | null;
    status: string;
    verified: boolean;
    dnsHint?: { type: string; name: string; value: string } | null;
    message?: string;
  } | null>(null);

  const displayName = entityProject?.title ?? project?.name ?? "app";
  const domains = entityProject?.domains ?? project?.domains ?? [];
  const options = usePublishDomainOptions();

  const refreshDomain = useCallback(() => {
    if (!projectId || !ctx.workspaceId) return;
    void import("@/lib/api/project-domains-client").then(async (m) => {
      const state = await m.getProjectDomainClient({
        projectId,
        workspaceId: ctx.workspaceId,
      });
      if (state?.ok) {
        setDomainState({
          domain: state.domain,
          status: state.status,
          verified: state.verified,
          dnsHint: state.dnsHint,
          message: state.message,
        });
      }
    });
  }, [projectId, ctx.workspaceId]);

  useEffect(() => {
    refreshDomain();
  }, [refreshDomain]);

  const addDomain = async () => {
    if (!projectId || busy) return;
    const normalized = normalizeCustomDomain(draft);
    if (!normalized) {
      setError("Enter a domain name.");
      return;
    }
    if (!isValidDomain(normalized)) {
      setError("Enter a valid domain like app.example.com");
      return;
    }
    if (domains.some((item) => normalizeCustomDomain(item) === normalized)) {
      setError("That domain is already on this project.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const m = await import("@/lib/api/project-domains-client");
      const result = await m.attachProjectDomainClient({
        projectId,
        workspaceId: ctx.workspaceId,
        domain: normalized,
      });
      if (!result?.ok) {
        // Fall back to local list if domain API unavailable.
        if (result?.error?.includes("VERCEL_TOKEN") || result?.error?.includes("not available")) {
          await updateProject(ctx, projectId, {
            domains: [...domains, normalized],
          });
          setDraft("");
          setError("Saved. The domain will connect once your site is published.");
        } else {
          setError(result?.error || "Could not attach domain.");
        }
      } else {
        setDraft("");
        setDomainState({
          domain: result.domain,
          status: result.status,
          verified: result.verified,
          dnsHint: result.dnsHint,
          message: result.message,
        });
        notifyEntityStoreChange();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save domain.");
    } finally {
      setBusy(false);
    }
  };

  const removeDomain = async (domain: string) => {
    if (!projectId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const m = await import("@/lib/api/project-domains-client");
      const result = await m.detachProjectDomainClient({
        projectId,
        workspaceId: ctx.workspaceId,
        domain,
      });
      if (!result?.ok) {
        await updateProject(ctx, projectId, {
          domains: domains.filter((item) => item !== domain),
        });
      } else {
        setDomainState({
          domain: null,
          status: "none",
          verified: false,
          dnsHint: null,
        });
        notifyEntityStoreChange();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove domain.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!compact ? (
        <>
          <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em]">
            Domains
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Connect a custom domain to {displayName}. It goes live once your
            DNS is verified.
          </p>
        </>
      ) : null}

      <p className={cn("text-[13px] font-medium", compact ? "mt-0" : "mt-5")}>
        Connected domains
      </p>
      <div className="mt-2 space-y-2">
        {options.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-[13px]">{item.label}</p>
              <p className="text-[12px] text-muted-foreground">
                {item.id === "cander"
                  ? item.hint
                  : domainState?.domain === normalizeCustomDomain(item.label) &&
                      domainState.status === "verified"
                    ? "Verified"
                    : domainState?.domain === normalizeCustomDomain(item.label)
                      ? `Status: ${domainState.status}`
                      : item.hint}
              </p>
            </div>
            {item.id !== "cander" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeDomain(item.id)}
                className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {domainState?.dnsHint && domainState.status === "pending" ? (
        <div className="mt-3 rounded-[10px] border border-border bg-muted/30 p-3">
          <p className="text-[12px] font-medium">DNS to finish verification</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {domainState.dnsHint.type} {domainState.dnsHint.name} →{" "}
            {domainState.dnsHint.value}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => refreshDomain()}
            className="mt-2 text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
          >
            Refresh verification
          </button>
        </div>
      ) : null}

      <p className="mt-5 text-[13px] font-medium">Add custom domain</p>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addDomain();
            }
          }}
          placeholder="app.example.com"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-muted/40 px-3 font-mono text-[13px] outline-none"
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void addDomain()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[12px] text-destructive">{error}</p>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Add a CNAME record pointing at cname.vercel-dns.com. Only verified
          domains can be used as your site’s address.
        </p>
      )}
    </div>
  );
}
