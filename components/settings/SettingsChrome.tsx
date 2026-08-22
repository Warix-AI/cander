import type { ReactNode } from "react";
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
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div
        className={cn(
          "mx-auto w-full px-5 pt-7 pb-14 sm:px-8 lg:px-10 lg:pt-9",
          wide ? "max-w-6xl" : "max-w-3xl",
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
  return (
    <section className={cn("mt-8", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h3 className="heading-section text-[1rem] tracking-[-0.02em]">
            {title}
          </h3>
          {description ? (
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
 * separated by dividers; use `title` for an in-card group label.
 */
export function SettingsGroup({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-border bg-card",
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
      <div className="divide-y divide-border">{children}</div>
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
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-card",
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
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[10px] border border-border bg-card px-4 py-3.5"
        >
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            {item.label}
          </p>
          <p className="mt-1.5 text-[14.5px] font-medium tracking-[-0.02em]">
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
