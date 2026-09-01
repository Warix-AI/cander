"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, LayoutGrid, List, Pin, Plus, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NavToggle } from "@/components/shell/NavToggle";
import { SpaceBanner } from "@/components/spaces/SpaceBanner";
import { useSpaceRenderMode } from "@/components/spaces/SpaceRenderMode";
import { Dropdown } from "@/components/ui/Controls";
import { useDesktopShell } from "@/lib/desktop-shell";
import { useMobileShell } from "@/lib/use-media-query";
import type { SpaceId, SpaceLayout } from "@/lib/types";
import type { BannerKey } from "@/lib/space-banners";
import {
  MobileFilterBar,
  type MobilePanelExtraItem,
  type MobilePanelScopeConfig,
} from "@/components/shell/mobile/MobilePanelActions";
import { SPACE_CANVAS_BG } from "@/lib/mobile-menu-styles";
import { isDashboardOnlySpace } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import {
  FLOAT_CONTROL_SHELL,
  FLOAT_TOGGLE_ACTIVE,
} from "@/lib/shell-chrome";

/** True when the space chat column is dismissed (no active thread or draft). */
export function useSpaceChatClosed() {
  const { drafting, threadId } = useApp();
  return !(drafting || threadId);
}

export function LayoutToggle({
  layout,
  onChange,
  compact = false,
}: {
  layout: SpaceLayout;
  onChange: (id: SpaceLayout) => void;
  compact?: boolean;
}) {
  const mobile = useMobileShell();

  if (mobile) {
    const Current = layout === "cards" ? LayoutGrid : List;
    return (
      <Dropdown
        align="end"
        matchTrigger={false}
        menuClassName="min-w-[10.5rem]"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-label={layout === "cards" ? "Card view" : "List view"}
            aria-expanded={open}
            onClick={toggle}
            className={cn(
              "inline-flex items-center justify-center rounded-[10px] transition-colors duration-200",
              compact ? "h-8 w-8" : "h-9 w-9",
              FLOAT_CONTROL_SHELL,
              "text-foreground",
            )}
          >
            <Current className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        )}
      >
        {(close) => (
          <>
            {(
              [
                { id: "cards" as const, label: "Cards", Icon: LayoutGrid },
                { id: "list" as const, label: "List", Icon: List },
              ] as const
            ).map((item) => {
              const active = layout === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onChange(item.id);
                    close();
                  }}
                  className={cn(
                    "menu-row-hover flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors",
                    active && "font-medium",
                  )}
                >
                  <item.Icon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.6}
                  />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {active ? (
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  ) : null}
                </button>
              );
            })}
          </>
        )}
      </Dropdown>
    );
  }

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
  const mobile = useMobileShell();
  const active = options.find((item) => item.id === value) ?? options[0];

  if (mobile) {
    return (
      <Dropdown
        align="start"
        matchTrigger={false}
        menuClassName="min-w-[11rem]"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-expanded={open}
            onClick={toggle}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-[10px] px-3 font-medium tracking-[-0.01em] transition-colors duration-200",
              compact ? "h-8 text-[12px]" : "h-9 text-[13px]",
              FLOAT_CONTROL_SHELL,
              "text-foreground",
            )}
          >
            <span className="truncate">{active?.label ?? "Filter"}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
              strokeWidth={1.8}
            />
          </button>
        )}
      >
        {(close) => (
          <>
            {options.map((item) => {
              const selected = value === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onChange(item.id);
                    close();
                  }}
                  className={cn(
                    "menu-row-hover flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors",
                    selected && "font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  ) : null}
                </button>
              );
            })}
          </>
        )}
      </Dropdown>
    );
  }

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
  subtitleAction,
  banner = true,
  surfaceClassName,
  children,
}: {
  space?: SpaceId;
  bannerKey?: BannerKey;
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  titleAction?: ReactNode;
  subtitleAction?: ReactNode;
  banner?: boolean;
  surfaceClassName?: string;
  children: ReactNode;
}) {
  const { spaceId, sidebarOpen, view } = useApp();
  const mode = useSpaceRenderMode();
  const inPanel = mode === "panel";
  const desktop = useDesktopShell();
  const mobile = useMobileShell();
  const rawBanner = banner
    ? (bannerKey ?? space ?? spaceId)
    : null;
  const bannerSpace =
    rawBanner &&
    rawBanner !== "connectors" &&
    !isDashboardOnlySpace(rawBanner)
      ? (rawBanner as BannerKey)
      : null;
  // Mobile: skip in-page hero — app chrome or panel split owns the title row.
  const hideMobileHero = mobile && (Boolean(bannerSpace) || !banner);

  return (
    <div
      className={cn(
        "@container relative flex min-h-0 flex-1 flex-col overflow-y-auto",
        surfaceClassName ?? SPACE_CANVAS_BG,
      )}
    >
      {view === "space" && !bannerSpace && !inPanel && !desktop ? (
        <NavToggle
          className={cn(
            "absolute top-1.5 left-2 z-20",
            sidebarOpen && "lg:hidden",
          )}
        />
      ) : null}
      {hideMobileHero ? null : bannerSpace ? (
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
                subtitleAction={subtitleAction}
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
                compact={false}
              />
            </div>
          </SpaceBanner>
        </div>
      ) : (
        <div
          className={cn(
            "mx-auto w-full px-4 @min-[480px]:px-8",
            inPanel
              ? "max-w-none pt-5 pb-3 pr-12 @min-[480px]:pt-6"
              : "max-w-6xl pb-3 pt-6 @min-[480px]:pt-8",
            mobile && !inPanel && "px-4 pt-3 pb-2",
          )}
        >
          <DashHeader
            kicker={kicker}
            title={title}
            subtitle={subtitle}
            titleAction={titleAction}
            subtitleAction={subtitleAction}
            inPanel={inPanel}
            compact={mobile}
          />
        </div>
      )}
      <div
        className={cn(
          "mx-auto w-full px-4 pt-3 pb-4 @min-[480px]:px-8 @min-[480px]:pb-6",
          mobile && "px-4 py-3",
          hideMobileHero && "pt-3",
          inPanel ? "max-w-none pr-12" : "max-w-6xl",
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
  subtitleAction,
  onBanner = false,
  inPanel = false,
  compact = false,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  titleAction?: ReactNode;
  subtitleAction?: ReactNode;
  onBanner?: boolean;
  inPanel?: boolean;
  compact?: boolean;
}) {
  if (onBanner) {
    return (
      <div className="flex w-full flex-col items-start justify-between gap-3 @min-[520px]:flex-row @min-[520px]:items-end @min-[520px]:flex-wrap">
        <div className="min-w-0">
          {kicker ? (
            <p className="flex items-center gap-1.5 text-[11px] tracking-[0.06em] text-white/65 uppercase">
              {kicker}
            </p>
          ) : null}
          <div
            className={cn(
              "flex flex-wrap items-center gap-3",
              kicker && "mt-1.5 max-lg:mt-2",
            )}
          >
            <h1 className="heading-display text-[1.55rem] text-white @min-[480px]:text-[1.85rem]">
              {title}
            </h1>
            {titleAction}
          </div>
          {subtitle ? (
            <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-white/70 @min-[480px]:mt-2 @min-[480px]:text-[14px]">
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

  return (
    <div className="min-w-0">
      {subtitleAction ? (
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-3">
          <div className="col-start-1 row-start-1 flex flex-wrap items-center gap-2.5">
            <h1
              className={cn(
                "heading-display text-foreground",
                compact
                  ? "text-[1.25rem] leading-tight"
                  : "text-[1.55rem] leading-tight @min-[480px]:text-[1.85rem]",
              )}
            >
              {title}
            </h1>
            {titleAction}
          </div>
          {subtitle ? (
            <p
              className={cn(
                "col-start-1 row-start-2 mt-1.5 min-w-0 max-w-xl text-[13.5px] leading-snug text-muted-foreground @min-[480px]:mt-2 @min-[480px]:text-[14px]",
                compact && "mt-1 text-[13px]",
              )}
            >
              {subtitle}
            </p>
          ) : null}
          <div className="col-start-2 row-start-2 shrink-0 self-center">
            {subtitleAction}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className={cn(
                "heading-display text-foreground",
                compact
                  ? "text-[1.25rem] leading-tight"
                  : "text-[1.55rem] leading-tight @min-[480px]:text-[1.85rem]",
              )}
            >
              {title}
            </h1>
            {titleAction}
          </div>
          {subtitle ? (
            <p
              className={cn(
                "mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground @min-[480px]:mt-2 @min-[480px]:text-[14px]",
                compact && "text-[13px]",
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Layout toggle on the left, space actions on the right — one row under the title. */
export function DashToolbar({
  active = false,
  actions,
  children,
  className,
  onNewChat,
  newChatLabel,
  scope,
  layout,
  extras,
}: {
  active?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  onNewChat?: () => void;
  newChatLabel?: string;
  scope?: MobilePanelScopeConfig;
  layout?: { value: SpaceLayout; onChange: (value: SpaceLayout) => void };
  extras?: MobilePanelExtraItem[];
}) {
  return (
    <MobileFilterBar
      active={active}
      onNewChat={onNewChat}
      newChatLabel={newChatLabel}
      scope={scope}
      layout={layout}
      extras={extras}
      className={cn(className)}
    >
      <div className="flex shrink-0 items-center">{children}</div>
      {actions ? (
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </MobileFilterBar>
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
        "inline-flex h-9 items-center gap-1.5 rounded-[10px] text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200",
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
