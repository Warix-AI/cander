"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { MOBILE_APP_BG, MOBILE_SETTINGS_SURFACE } from "@/lib/mobile-menu-styles";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/** Full-page settings canvas — matches space dashboard width and padding. */
export function SettingsPage({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  /** Plans / dense comparison tables. */
  wide?: boolean;
  className?: string;
}) {
  const mobile = useMobileShell();
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        mobile ? MOBILE_APP_BG : "bg-background",
      )}
    >
      <div
        className={cn(
          "mx-auto w-full",
          mobile
            ? "px-4 pt-3 pb-10"
            : "px-5 pt-7 pb-14 sm:px-8 lg:px-10 lg:pt-9",
          wide ? "max-w-6xl" : "max-w-[53.2rem]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SettingsHeader({
  kicker = "Settings",
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const mobile = useMobileShell();

  // Mobile chrome already shows the title — keep subtitle/actions only.
  if (mobile) {
    if (!subtitle && !actions) return null;
    return (
      <header
        className={cn(
          "flex flex-wrap items-start gap-3",
          subtitle ? "justify-between" : "justify-end",
        )}
      >
        {subtitle ? (
          <p className="min-w-0 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
    );
  }

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          {kicker}
        </p>
        <h2
          id="settings-title"
          className="heading-display mt-1.5 text-[1.75rem] tracking-[-0.03em] sm:text-[1.95rem]"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** Section heading above one or more Groups — denser than before. */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const mobile = useMobileShell();
  return (
    <section className={cn(mobile ? "mt-6" : "mt-8", className)}>
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-3",
          mobile ? "mb-2 px-1" : "mb-3",
        )}
      >
        <div className="min-w-0 max-w-2xl">
          <h3
            className={cn(
              mobile
                ? "text-[13px] font-medium tracking-[-0.01em] text-muted-foreground"
                : "heading-section text-[1rem] tracking-[-0.02em]",
            )}
          >
            {title}
          </h3>
          {description && !mobile ? (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * Cursor-like bordered card. Children are typically SettingsRow items
 * separated by Apple-style inset hairlines (start under the text column).
 */
export function SettingsGroup({
  title,
  children,
  className,
  /** `icon` insets past a leading 16px icon + gap (settings hub rows). */
  dividerInset = "plain",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  dividerInset?: "plain" | "icon";
}) {
  const mobile = useMobileShell();
  return (
    <div
      className={cn(
        "overflow-hidden",
        mobile
          ? MOBILE_SETTINGS_SURFACE
          : "border border-border bg-card rounded-[10px]",
        mobile ? SHELL_G3_RADIUS : undefined,
        className,
      )}
    >
      {title ? (
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {title}
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border",
          dividerInset === "icon"
            ? "[&>*+*]:before:left-[2.75rem]"
            : "[&>*+*]:before:left-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Preference row: label + description left, control right. */
export function SettingsRow({
  label,
  description,
  children,
  className,
  onClick,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium tracking-[-0.01em]">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={cn("flex w-full items-center gap-4 px-4 py-3.5", className)}>
      {body}
    </div>
  );
}

/** Freeform surface for previews, tables, multi-field blocks. */
export function SettingsPanel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  const mobile = useMobileShell();
  return (
    <div
      className={cn(
        mobile
          ? MOBILE_SETTINGS_SURFACE
          : "border border-border bg-card rounded-[10px]",
        mobile ? SHELL_G3_RADIUS : undefined,
        padded && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsStatGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  const mobile = useMobileShell();
  return (
    <div
      className={cn(
        "overflow-hidden",
        mobile
          ? MOBILE_SETTINGS_SURFACE
          : "border border-border bg-card rounded-[10px]",
        mobile ? SHELL_G3_RADIUS : undefined,
        "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-4 [&>*+*]:before:h-px [&>*+*]:before:bg-border",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-baseline justify-between gap-4 px-4 py-3.5"
        >
          <p
            className={cn(
              "text-muted-foreground",
              mobile
                ? "text-[13px] tracking-[-0.01em]"
                : "font-mono text-[10.5px] tracking-[0.08em] uppercase",
            )}
          >
            {item.label}
          </p>
          <p className="text-right text-[14.5px] font-medium tracking-[-0.02em]">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function SettingsField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
        {label}
      </span>
      {hint ? (
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground/80">
          {hint}
        </span>
      ) : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

/** Shared input chrome for settings forms. */
export const settingsInputClass =
  "h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-foreground/20";

export const settingsSelectClass =
  "h-9 rounded-[10px] border border-border bg-background px-2.5 text-[13px] outline-none focus:border-foreground/20";

/** Muted helper copy below a settings group (mobile footnotes). */
export function SettingsFootnote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-2 px-1 text-[12.5px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** iOS-style toggle for mobile settings rows. */
export function SettingsSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200",
        checked ? "bg-[#34C759]" : "bg-muted",
        disabled && "opacity-40",
      )}
    >
      <span
        className={cn(
          "inline-block h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

/** Navigable row: label left, optional value + chevron right. */
export function SettingsLinkRow({
  label,
  description,
  value,
  onClick,
  destructive = false,
  className,
  children,
}: {
  label: string;
  description?: string;
  value?: string;
  onClick?: () => void;
  destructive?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[15px] font-medium tracking-[-0.01em] lg:text-[13.5px]",
            destructive && "text-destructive",
          )}
        >
          {label}
        </p>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground lg:text-[12.5px]">
            {description}
          </p>
        ) : null}
      </div>
      {children ?? (
        <div className="flex shrink-0 items-center gap-1.5">
          {value ? (
            <span className="max-w-[9rem] truncate text-[15px] text-muted-foreground lg:text-[13px]">
              {value}
            </span>
          ) : null}
          {onClick ? (
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground/70"
              strokeWidth={1.8}
            />
          ) : null}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50 lg:gap-4",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={cn("flex w-full items-center gap-3 px-4 py-3.5 lg:gap-4", className)}>
      {body}
    </div>
  );
}
