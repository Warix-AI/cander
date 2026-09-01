"use client";

import { useMemo, useState } from "react";
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

export function usePublishDomainOptions() {
  const { liveUrl, project, projectId } = useApp();
  const { project: entityProject } = useSpaceProject(projectId);
  const displayName = entityProject?.title ?? project?.name ?? "app";
  const domains = entityProject?.domains ?? project?.domains ?? [];

  return useMemo(
    () =>
      buildPublishDomainOptions({
        displayName,
        domains,
        liveUrl,
      }),
    [displayName, domains, liveUrl],
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

  const displayName = entityProject?.title ?? project?.name ?? "app";
  const domains = entityProject?.domains ?? project?.domains ?? [];
  const options = usePublishDomainOptions();

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
      await updateProject(ctx, projectId, {
        domains: [...domains, normalized],
      });
      setDraft("");
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
      await updateProject(ctx, projectId, {
        domains: domains.filter((item) => item !== domain),
      });
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
            Connect a custom domain to {displayName}. Pick a domain when you
            publish, or use the default {options[0]?.label ?? "cander.app"} URL.
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
              <p className="text-[12px] text-muted-foreground">{item.hint}</p>
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
          Point your DNS CNAME to cander.app. Verification runs when you publish.
        </p>
      )}
    </div>
  );
}
