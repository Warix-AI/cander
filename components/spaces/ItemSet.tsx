"use client";

import type { ReactNode } from "react";
import { LayoutGrid, List, Pin, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NavToggle } from "@/components/shell/NavToggle";
import { SpaceBanner } from "@/components/spaces/SpaceBanner";
import type { SpaceId, SpaceLayout } from "@/lib/types";
import type { BannerKey } from "@/lib/space-banners";
import { cn } from "@/lib/utils";

export function LayoutToggle({
  layout,
  onChange,
  compact = false,
}: {
  layout: SpaceLayout;
  onChange: (id: SpaceLayout) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-[10px] border border-foreground/12 p-0.5",
        compact ? "h-8" : "h-10",
      )}
    >
      <button
        type="button"
        aria-label="Card view"
        aria-pressed={layout === "cards"}
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex items-center justify-center rounded-[10px] transition-colors duration-200",
          compact ? "h-7 w-7" : "h-9 w-9",
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
          "inline-flex items-center justify-center rounded-[10px] transition-colors duration-200",
          compact ? "h-7 w-7" : "h-9 w-9",
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
    pinned?: boolean;
    onPin?: () => void;
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
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "group flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 transition-colors duration-200",
              item.onClick && "hover:bg-muted",
              item.active && "bg-muted",
            )}
          >
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-left"
              >
                <ItemCopy item={item} />
                {item.meta ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {item.meta}
                  </span>
                ) : null}
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <ItemCopy item={item} />
                {item.meta ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {item.meta}
                  </span>
                ) : null}
              </div>
            )}
            <PinToggle pinned={item.pinned} onPin={item.onPin} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "group relative rounded-[10px] border border-border bg-card p-4 text-left transition-colors duration-200",
            item.onClick && "hover:bg-muted",
            item.active && "border-foreground/20 bg-muted",
          )}
        >
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="w-full pr-8 text-left"
            >
              <ItemCopy item={item} card />
              {item.meta ? (
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  {item.meta}
                </p>
              ) : null}
            </button>
          ) : (
            <div className="pr-8">
              <ItemCopy item={item} card />
              {item.meta ? (
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  {item.meta}
                </p>
              ) : null}
            </div>
          )}
          <div className="absolute top-3 right-3">
            <PinToggle pinned={item.pinned} onPin={item.onPin} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemCopy({
  item,
  card = false,
}: {
  item: { title: string; snippet?: string };
  card?: boolean;
}) {
  if (card) {
    return (
      <>
        <p className="truncate text-[14px] font-medium tracking-[-0.02em]">
          {item.title}
        </p>
        {item.snippet ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {item.snippet}
          </p>
        ) : null}
      </>
    );
  }

  return (
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
  );
}

function PinToggle({
  pinned,
  onPin,
}: {
  pinned?: boolean;
  onPin?: () => void;
}) {
  if (!onPin) return null;
  return (
    <button
      type="button"
      aria-label={pinned ? "Unpin" : "Pin"}
      aria-pressed={Boolean(pinned)}
      onClick={(event) => {
        event.stopPropagation();
        onPin();
      }}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-muted hover:text-foreground",
        pinned ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Pin
        className={cn("h-3.5 w-3.5", pinned && "fill-current")}
        strokeWidth={1.6}
      />
    </button>
  );
}

export function ScopeToggle({
  value,
  onChange,
  options,
  compact = false,
  wrap = false,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string }[];
  compact?: boolean;
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        "items-center rounded-[10px] border border-foreground/12 p-0.5",
        wrap ? "flex flex-wrap" : "inline-flex",
        wrap ? (compact ? "min-h-8" : "min-h-10") : compact ? "h-8" : "h-10",
      )}
    >
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "inline-flex items-center rounded-[10px] font-medium tracking-[-0.01em] transition-colors duration-200",
            compact ? "h-7 px-2.5 text-[12px]" : "h-9 px-3 text-[13px]",
            value === item.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function DashFrame({
  space,
  bannerKey,
  kicker,
  title,
  subtitle,
  actions,
  titleAction,
  banner = true,
  children,
}: {
  space?: SpaceId;
  bannerKey?: BannerKey;
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  titleAction?: ReactNode;
  banner?: boolean;
  children: ReactNode;
}) {
  const { spaceId, sidebarOpen, mobileNav, view, product } = useApp();
  const bannerSpace = banner
    ? (bannerKey ?? space ?? (product === "platform" ? null : spaceId))
    : null;

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      {((view === "space" || product === "platform") && !bannerSpace) ? (
        <NavToggle
          className={cn(
            "absolute top-1.5 left-2 z-20",
            sidebarOpen && "lg:hidden",
            mobileNav && "max-lg:hidden",
          )}
        />
      ) : null}
      {bannerSpace ? (
        <div>
          <SpaceBanner space={bannerSpace}>
            <div className="mx-auto flex h-full w-full max-w-6xl items-start px-8 pt-8">
              <DashHeader
                kicker={kicker}
                title={title}
                subtitle={subtitle}
                titleAction={titleAction}
                actions={
                  actions ? (
                    <span className="flex flex-wrap items-center gap-2 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:text-white [&_button]:hover:bg-white/20 [&_button.bg-primary]:border-transparent [&_button.bg-primary]:bg-white [&_button.bg-primary]:text-neutral-950 [&_button.bg-primary]:hover:bg-white/90">
                      {actions}
                    </span>
                  ) : null
                }
                onBanner
              />
            </div>
          </SpaceBanner>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-6xl px-8 pt-8">
          <DashHeader
            kicker={kicker}
            title={title}
            subtitle={subtitle}
            titleAction={titleAction}
            actions={actions}
          />
        </div>
      )}
      <div className="mx-auto w-full max-w-6xl px-8 py-6">{children}</div>
    </div>
  );
}

function DashHeader({
  kicker,
  title,
  subtitle,
  actions,
  titleAction,
  onBanner = false,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  titleAction?: ReactNode;
  onBanner?: boolean;
}) {
  return (
    <div className="flex w-full flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p
          className={cn(
            "text-[11px] tracking-[0.06em] uppercase",
            onBanner ? "text-white/65" : "text-muted-foreground",
          )}
        >
          {kicker}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1
            className={cn(
              "heading-display text-[1.85rem]",
              onBanner && "text-white",
            )}
          >
            {title}
          </h1>
          {titleAction}
        </div>
        {subtitle ? (
          <p
            className={cn(
              "mt-2 max-w-xl truncate text-[14px] leading-relaxed",
              onBanner ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
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

export function DashBtn({
  children,
  onClick,
  primary,
  icon,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  icon?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-[10px] text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
        icon ? "w-10 justify-center px-0" : "px-4",
        primary
          ? "bg-primary text-primary-foreground hover:bg-foreground"
          : "border border-foreground/15 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function SpaceSettingsButton({ space }: { space: SpaceId }) {
  const { openSpaceSettings } = useApp();
  return (
    <DashBtn
      icon
      label={`${space} settings`}
      onClick={() => openSpaceSettings(space)}
    >
      <Settings className="h-3.5 w-3.5" strokeWidth={1.6} />
    </DashBtn>
  );
}
