"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared Development chrome — match HostingPanel. */

export function PanelToolbar({
  children,
  trailing,
}: {
  children?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

export function GhostBtn({
  children,
  onClick,
  primary,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center rounded-[10px] px-3 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200",
        primary
          ? "bg-primary text-primary-foreground hover:bg-foreground"
          : "border border-foreground/12 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function SummaryCard({
  title,
  badge,
  body,
  detail,
  trailing,
}: {
  title: string;
  badge?: string;
  body?: string;
  detail?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="mt-6 flex items-start justify-between gap-4 rounded-[10px] border border-border bg-card px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[1.05rem] font-medium tracking-[-0.02em]">{title}</h3>
          {badge ? (
            <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-medium tracking-[-0.01em] text-background">
              {badge}
            </span>
          ) : null}
        </div>
        {body ? (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        ) : null}
        {detail ? (
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}

export function Section({
  title,
  hint,
  description,
  children,
  className,
}: {
  title: string;
  /** Short meta — right-aligned on the title row (e.g. "This month"). */
  hint?: string;
  /** Longer supporting copy under the title. */
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-medium tracking-[-0.02em]">{title}</h3>
        {hint ? (
          <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.6} /> : null}
        <span className="text-[12px]">{label}</span>
      </div>
      <p className="mt-2 font-mono text-[1.15rem] tracking-[-0.02em]">{value}</p>
      {hint ? (
        <p className="mt-1 text-[11.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function MeterCard({
  label,
  valueLabel,
  pct,
}: {
  label: string;
  valueLabel: string;
  pct: number;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium tracking-[-0.01em]">{label}</span>
        <span className="font-mono text-[12px] text-muted-foreground">
          {valueLabel}
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function DataList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card">
      {children}
    </div>
  );
}

export function DataRow({
  label,
  value,
  meta,
  trailing,
  onClick,
}: {
  label: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium tracking-[-0.01em]">{label}</div>
        {meta ? (
          <div className="mt-1 text-[12.5px] text-muted-foreground">{meta}</div>
        ) : null}
      </div>
      {value ? (
        <div className="shrink-0 text-right font-mono text-[12px] text-muted-foreground">
          {value}
        </div>
      ) : null}
      {trailing}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-baseline justify-between gap-4 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50"
      >
        {body}
      </button>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      {body}
    </div>
  );
}

export function ItemCard({
  title,
  meta,
  body,
  badge,
  selected,
  onClick,
  className,
}: {
  title: string;
  meta?: string;
  body?: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const classes = cn(
    "rounded-[10px] border bg-card p-4 text-left transition-colors duration-200",
    selected
      ? "border-foreground/45 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
      : "border-border",
    onClick && !selected && "hover:border-foreground/20",
    className,
  );

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium tracking-[-0.01em]">{title}</p>
          {meta ? (
            <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
        {badge}
      </div>
      {body ? <div className="mt-3">{body}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={classes}
      >
        {content}
      </button>
    );
  }

  return <article className={classes}>{content}</article>;
}

export function StatusPill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "active" | "muted" | "outline" | "danger";
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium tracking-[-0.01em]",
        tone === "active" && "bg-foreground text-background",
        tone === "muted" && "bg-muted text-foreground",
        tone === "outline" && "border border-border text-muted-foreground",
        tone === "danger" && "border border-destructive/30 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 py-2 text-[13px] text-muted-foreground">{children}</p>
  );
}

export function SoftNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}
