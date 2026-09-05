"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  defaultValue,
  value,
  onChange,
  onCommit,
  disabled,
  placeholder,
}: {
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <input
        key={onCommit ? `${label}-${defaultValue ?? ""}` : undefined}
        defaultValue={onCommit ? defaultValue : undefined}
        value={onChange ? value : undefined}
        disabled={disabled}
        placeholder={placeholder}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        onBlur={
          onCommit
            ? (event) => {
                if (event.target.value !== (defaultValue ?? "")) {
                  onCommit(event.target.value);
                }
              }
            : undefined
        }
        className="mt-1 h-9 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-foreground/30 disabled:opacity-60"
      />
    </label>
  );
}

export function TextArea({
  label,
  defaultValue,
  onCommit,
  disabled,
  rows = 5,
  placeholder,
}: {
  label: string;
  defaultValue: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <textarea
        key={`${label}-${defaultValue.slice(0, 24)}`}
        defaultValue={defaultValue}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        className="mt-1 w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/30 disabled:opacity-60"
        onBlur={(event) => {
          if (event.target.value !== defaultValue) onCommit(event.target.value);
        }}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-[10px] border border-border bg-background px-2.5 text-[13px] outline-none focus:border-foreground/30 disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ListRow({
  title,
  meta,
  onRemove,
}: {
  title: string;
  meta?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{title}</p>
        {meta ? (
          <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
    </div>
  );
}

export function ChoiceChips({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled || opt.disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-8 rounded-[10px] border px-2.5 text-[12px] font-medium disabled:opacity-50",
            value === opt.value
              ? "border-foreground/30 bg-foreground text-background"
              : "border-border hover:bg-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function InspectorSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {title ? (
        <p className="text-[12.5px] text-muted-foreground">{title}</p>
      ) : null}
      {children}
    </div>
  );
}
