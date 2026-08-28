"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  ExternalLink,
  MousePointer2,
  Pencil,
  Upload,
  X,
} from "lucide-react";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { cn } from "@/lib/utils";

export type ProjectSheetMode = "actions" | "info" | "add" | "rename" | "space";

export function MobileBottomSheet({
  open,
  onClose,
  mode = "actions",
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  mode?: ProjectSheetMode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tall =
    mode === "info" || mode === "add" || mode === "rename" || mode === "space";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden border border-border bg-background shadow-[0_-12px_40px_rgba(0,0,0,0.18)]",
          tall ? "max-h-[92dvh] rounded-t-[22px]" : "max-h-[70dvh] rounded-t-[22px]",
          className,
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
        </div>
        <div id={titleId} className="sr-only">
          Project
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProjectActionsSheetBody({
  published,
  projectName,
  selectMode,
  canRename,
  onPublish,
  onOpenExternal,
  onSelectElement,
  onRename,
}: {
  published?: boolean;
  projectName?: string;
  selectMode?: boolean;
  canRename?: boolean;
  onPublish: () => void;
  onOpenExternal: () => void;
  onSelectElement: () => void;
  onRename?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-1">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            published ? "bg-emerald-500" : "bg-muted-foreground/50",
          )}
        />
        <p className="text-[15px] font-medium tracking-[-0.01em]">
          {published ? "Published" : "Draft"}
        </p>
        {projectName ? (
          <p className="min-w-0 truncate text-[15px] text-muted-foreground">
            {projectName}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-0.5">
        <SheetAction icon={Upload} label="Publish" onClick={onPublish} primary />
        <SheetAction
          icon={ExternalLink}
          label="Open externally"
          onClick={onOpenExternal}
        />
        <SheetAction
          icon={MousePointer2}
          label="Select element"
          active={selectMode}
          onClick={onSelectElement}
        />
        {canRename && onRename ? (
          <SheetAction
            icon={Pencil}
            label="Rename project"
            onClick={onRename}
          />
        ) : null}
      </div>
    </div>
  );
}

export function ProjectRenameSheetBody({
  value,
  error,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  value: string;
  error?: string | null;
  busy?: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="flex min-h-0 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2">
      <h2 className="text-[1.35rem] font-semibold tracking-[-0.02em]">
        Rename project
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Update the name shown in your workspace.
      </p>

      <label className="mt-5 text-[13px] font-medium tracking-[-0.01em]">
        Display name
      </label>
      <input
        ref={inputRef}
        value={value}
        maxLength={100}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
        }}
        spellCheck={false}
        className="mt-2 h-11 w-full rounded-[12px] border border-border bg-muted/40 px-3.5 text-[15px] outline-none"
      />
      {error ? (
        <p className="mt-2 text-[12px] text-destructive">{error}</p>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Supports spaces and special characters, up to 100 characters. Names
          must be unique in this workspace and are visible to members — not to
          visitors of a published app.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-full border border-border text-[14px] font-medium tracking-[-0.01em] hover:bg-muted/60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="h-11 rounded-full bg-foreground text-[14px] font-medium tracking-[-0.01em] text-background disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export function ProjectInfoSheetHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2">
      <p className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em]">
        {title}
      </p>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <PanelToggle />
      </div>
    </div>
  );
}

export function ProjectAddSheetHeader({
  query,
  onQueryChange,
  onClose,
  onSubmit,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="shrink-0">
      <div className="flex items-center justify-end gap-0.5 px-3 pt-1">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <PanelToggle />
      </div>
      <form
        className="px-4 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search or enter a URL"
          spellCheck={false}
          className="h-11 w-full rounded-[12px] bg-muted/60 px-3.5 text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </form>
    </div>
  );
}

export function SheetAction({
  icon: Icon,
  label,
  onClick,
  active,
  primary,
  description,
}: {
  icon?: typeof Upload;
  label: string;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors",
        primary
          ? "bg-foreground text-background hover:opacity-90"
          : active
            ? "bg-muted text-foreground"
            : "text-foreground hover:bg-muted/70",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] tracking-[-0.01em]">{label}</span>
        {description ? (
          <span
            className={cn(
              "mt-0.5 block text-[12px]",
              primary ? "text-background/70" : "text-muted-foreground",
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
