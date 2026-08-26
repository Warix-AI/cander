"use client";

import type { ReactNode } from "react";
import { LayoutGrid, List, Pin, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NavToggle } from "@/components/shell/NavToggle";
import { SpaceBanner } from "@/components/spaces/SpaceBanner";
import { useSpaceRenderMode } from "@/components/spaces/SpaceRenderMode";
import type { SpaceId, SpaceLayout } from "@/lib/types";
import type { BannerKey } from "@/lib/space-banners";
import { cn } from "@/lib/utils";
import {
  FLOAT_CONTROL_SHELL,
  FLOAT_TOGGLE_ACTIVE,
} from "@/lib/shell-chrome";

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
        "inline-flex items-center gap-0.5 rounded-[10px] p-1",
        FLOAT_CONTROL_SHELL,
      )}
    >
      <button
        type="button"
        aria-label="Card view"
        aria-pressed={layout === "cards"}
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex items-center justify-center rounded-[8px] transition-colors duration-200",
          compact ? "h-6 w-6" : "h-8 w-8",
          layout === "cards"
            ? FLOAT_TOGGLE_ACTIVE
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
          "inline-flex items-center justify-center rounded-[8px] transition-colors duration-200",
          compact ? "h-6 w-6" : "h-8 w-8",
          layout === "list"
            ? FLOAT_TOGGLE_ACTIVE
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
              "group flex w-full items-center gap-2 rounded-[10px] canvas-hover py-2.5",
            )}
            data-active={item.active ? "true" : undefined}
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
    <div className="grid grid-cols-1 gap-3 @min-[440px]:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "group relative rounded-[10px] border border-border bg-card p-4 text-left canvas-hover",
            item.active && "border-foreground/20 bg-canvas-active",
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
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-200 hover:bg-canvas-hover hover:text-foreground",
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
        "inline-flex max-w-full items-center gap-0.5 rounded-[10px] p-1",
        FLOAT_CONTROL_SHELL,
        wrap ? "flex-wrap" : null,
      )}
    >
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "inline-flex items-center rounded-[8px] font-medium tracking-[-0.01em] transition-colors duration-200",
            compact ? "h-6 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
            value === item.id
              ? FLOAT_TOGGLE_ACTIVE
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
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  titleAction?: ReactNode;
  banner?: boolean;
  children: ReactNode;
}) {
  const { spaceId, sidebarOpen, view } = useApp();
  const mode = useSpaceRenderMode();
  const inPanel = mode === "panel";
  const bannerSpace = banner ? (bannerKey ?? space ?? spaceId) : null;

  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
      {(view === "space" && !bannerSpace && !inPanel) ? (
        <NavToggle
          className={cn(
            "absolute top-1.5 left-2 z-20",
            sidebarOpen && "lg:hidden",
          )}
        />
      ) : null}
      {bannerSpace ? (
        <div>
          <SpaceBanner space={bannerSpace}>
            <div
              className={cn(
                "mx-auto flex h-full w-full items-start px-4 pt-10 pb-4 max-lg:pt-11 @min-[480px]:px-8 @min-[480px]:pt-6 @min-[480px]:pb-5",
                inPanel && "pt-5 max-lg:pt-5",
                inPanel ? "max-w-none" : "max-w-6xl",
              )}
            >
              <DashHeader
                kicker={kicker}
                title={title}
                subtitle={subtitle}
                titleAction={titleAction}
                actions={
                  actions ? (
                    <span
                      className={cn(
                        "flex flex-wrap items-center gap-2 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:text-white [&_button]:hover:bg-white/20 [&_button.bg-primary]:border-transparent [&_button.bg-primary]:bg-white [&_button.bg-primary]:text-neutral-950 [&_button.bg-primary]:hover:bg-white/90",
                        inPanel && "[&>button:first-child]:hidden",
                      )}
                    >
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
        <div
          className={cn(
            "mx-auto w-full px-4 pt-6 @min-[480px]:px-8 @min-[480px]:pt-8",
            inPanel ? "max-w-none" : "max-w-6xl",
          )}
        >
          <DashHeader
            kicker={kicker}
            title={title}
            subtitle={subtitle}
            titleAction={titleAction}
            actions={
              inPanel ? (
                <span className="[&>button:first-child]:hidden">{actions}</span>
              ) : (
                actions
              )
            }
          />
        </div>
      )}
      <div
        className={cn(
          "mx-auto w-full px-4 py-4 @min-[480px]:px-8 @min-[480px]:py-6",
          inPanel ? "max-w-none" : "max-w-6xl",
        )}
      >
        {children}
      </div>
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
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  titleAction?: ReactNode;
  onBanner?: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-start justify-between gap-3 @min-[520px]:flex-row @min-[520px]:items-end @min-[520px]:flex-wrap">
      <div className="min-w-0">
        {kicker ? (
          <p
            className={cn(
              "flex items-center gap-1.5 text-[11px] tracking-[0.06em] uppercase",
              onBanner ? "text-white/65" : "text-muted-foreground",
            )}
          >
            {kicker}
          </p>
        ) : null}
        <div className={cn("flex flex-wrap items-center gap-3", kicker && "mt-1.5 max-lg:mt-2")}>
          <h1
            className={cn(
              "heading-display text-[1.55rem] @min-[480px]:text-[1.85rem]",
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
              "mt-1.5 max-w-xl text-[13.5px] leading-relaxed @min-[480px]:mt-2 @min-[480px]:text-[14px]",
              onBanner ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-lg:w-full">
          {actions}
        </div>
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
          : "inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200 hover:bg-canvas-hover"
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
          : "border border-foreground/15 hover:bg-canvas-hover",
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
