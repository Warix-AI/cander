"use client";

import type { ReactNode } from "react";
import { LayoutGrid, List } from "lucide-react";
import type { SpaceLayout } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LayoutToggle({
  layout,
  onChange,
}: {
  layout: SpaceLayout;
  onChange: (id: SpaceLayout) => void;
}) {
  return (
    <div className="inline-flex h-10 items-center rounded-[10px] border border-foreground/12 p-0.5">
      <button
        type="button"
        aria-label="Card view"
        aria-pressed={layout === "cards"}
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors duration-200",
          layout === "cards"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
      <button
        type="button"
        aria-label="List view"
        aria-pressed={layout === "list"}
        onClick={() => onChange("list")}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors duration-200",
          layout === "list"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
    </div>
  );
}

export function ItemSet({
  layout,
  items,
  empty,
}: {
  layout: SpaceLayout;
  items: {
    id: string;
    title: string;
    meta?: string;
    snippet?: string;
    active?: boolean;
    onClick?: () => void;
  }[];
  empty: string;
}) {
  if (!items.length) {
    return (
      <p className="px-3 py-4 text-[13px] text-muted-foreground">{empty}</p>
    );
  }

  if (layout === "list") {
    return (
      <div>
        {items.map((item) => {
          const className = cn(
            "flex w-full items-baseline justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-200",
            item.onClick && "hover:bg-muted",
            item.active && "bg-muted",
          );
          const body = (
            <>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] tracking-[-0.015em]">
                  {item.title}
                </span>
                {item.snippet ? (
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {item.snippet}
                  </span>
                ) : null}
              </span>
              {item.meta ? (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {item.meta}
                </span>
              ) : null}
            </>
          );
          if (item.onClick) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={className}
              >
                {body}
              </button>
            );
          }
          return (
            <div key={item.id} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const className = cn(
          "rounded-[10px] border border-border bg-card p-4 text-left transition-colors duration-200",
          item.onClick && "hover:bg-muted",
          item.active && "border-foreground/20 bg-muted",
        );
        const body = (
          <>
            <p className="truncate text-[14px] font-medium tracking-[-0.02em]">
              {item.title}
            </p>
            {item.snippet ? (
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                {item.snippet}
              </p>
            ) : null}
            {item.meta ? (
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                {item.meta}
              </p>
            ) : null}
          </>
        );
        if (item.onClick) {
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={className}
            >
              {body}
            </button>
          );
        }
        return (
          <div key={item.id} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function DashFrame({
  kicker,
  title,
  actions,
  children,
}: {
  kicker: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
              {kicker}
            </p>
            <h1 className="heading-display mt-2 text-[1.85rem]">{title}</h1>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pill({
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
      className={
        primary
          ? "inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground transition-colors duration-200 hover:bg-foreground"
          : "inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200 hover:bg-muted"
      }
    >
      {children}
    </button>
  );
}
