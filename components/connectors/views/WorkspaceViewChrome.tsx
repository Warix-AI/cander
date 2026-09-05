"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared chrome contract for Calendar / Drive / Sheets / Docs panels. */
export type WorkspaceToolbarState = {
  title: string;
  syncing: boolean;
  busy: boolean;
  canGoBack: boolean;
  backLabel?: string;
  primaryLabel: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onPrimary: (() => void) | null;
  /** Calendar month chrome — Today / prev / next live in the panel header. */
  calendarNav?: {
    onToday: () => void;
    onPrev: () => void;
    onNext: () => void;
    viewLabel?: string;
  } | null;
};

export function WorkspacePanelFrame({
  children,
  status,
  error,
}: {
  children: ReactNode;
  status?: string | null;
  error?: string | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-space-canvas">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {error ? (
        <p className="shrink-0 border-b border-black/5 px-3 py-2 text-[12px] text-destructive dark:border-white/10">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="shrink-0 border-b border-black/5 px-3 py-1.5 text-[11px] text-muted-foreground dark:border-white/10">
          {status}
        </p>
      ) : null}
      {children}
      </div>
    </div>
  );
}

export function WorkspaceEmptyState({
  title,
  body,
  actionLabel,
  syncing,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  syncing?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{body}</p>
      <button
        type="button"
        disabled={syncing}
        onClick={onAction}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5", syncing && "animate-spin")}
          strokeWidth={1.6}
        />
        {actionLabel}
      </button>
    </div>
  );
}

export function WorkspaceListRow({
  title,
  subtitle,
  meta,
  active,
  onClick,
  leading,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  active?: boolean;
  onClick: () => void;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 border-b border-black/5 px-4 py-3 text-left transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]",
        active && "bg-black/[0.04] dark:bg-white/[0.05]",
      )}
    >
      {leading ?? (
        <div className="mt-0.5 h-8 w-8 shrink-0 rounded-[8px] bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {title}
          </span>
          {meta ? (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
    </button>
  );
}

export function WorkspaceField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-[10px] border border-border bg-white px-3 text-[13px] outline-none dark:bg-space-canvas"
      />
    </label>
  );
}
