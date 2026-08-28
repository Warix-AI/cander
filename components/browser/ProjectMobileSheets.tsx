"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  Copy,
  ExternalLink,
  Globe,
  MousePointer2,
  Pencil,
  RotateCw,
  Upload,
  X,
} from "lucide-react";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { cn } from "@/lib/utils";

export type ProjectSheetMode = "actions" | "info" | "add";

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

  const tall = mode === "info" || mode === "add";
  const full = mode === "add";

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
          full
            ? "h-[min(100dvh,100%)] rounded-none pt-[env(safe-area-inset-top,0px)]"
            : tall
              ? "max-h-[92dvh] rounded-t-[22px]"
              : "max-h-[70dvh] rounded-t-[22px]",
          className,
        )}
      >
        {!full ? (
          <div className="flex shrink-0 justify-center pt-2.5 pb-1">
            <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
          </div>
        ) : null}
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
  statusNote,
  address,
  selectMode,
  projectName,
  canRename,
  renameValue,
  renameError,
  renameBusy,
  onRenameChange,
  onRenameSave,
  onPublish,
  onOpenExternal,
  onSelectElement,
  onRefresh,
  onCopyAddress,
  onEditAddress,
}: {
  published?: boolean;
  statusNote?: string;
  address: string;
  selectMode?: boolean;
  projectName?: string;
  canRename?: boolean;
  renameValue?: string;
  renameError?: string | null;
  renameBusy?: boolean;
  onRenameChange?: (value: string) => void;
  onRenameSave?: () => void;
  onPublish: () => void;
  onOpenExternal: () => void;
  onSelectElement: () => void;
  onRefresh: () => void;
  onCopyAddress?: () => void;
  onEditAddress?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                published ? "bg-emerald-500" : "bg-muted-foreground/50",
              )}
            />
            {published ? "Published" : "Draft"}
          </p>
          {statusNote ? (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{statusNote}</p>
          ) : null}
        </div>
      </div>

      {canRename && onRenameChange && onRenameSave ? (
        <div className="mt-4">
          <p className="text-[12px] font-medium text-muted-foreground">Name</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={renameValue ?? projectName ?? ""}
              onChange={(event) => onRenameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onRenameSave();
                }
              }}
              spellCheck={false}
              aria-label="Project name"
              className="h-10 min-w-0 flex-1 rounded-[12px] border border-border bg-muted/40 px-3 text-[15px] outline-none"
            />
            <button
              type="button"
              disabled={renameBusy}
              onClick={onRenameSave}
              className="inline-flex h-10 shrink-0 items-center rounded-[12px] bg-foreground px-3.5 text-[13px] font-medium text-background disabled:opacity-60"
            >
              {renameBusy ? "Saving…" : "Save"}
            </button>
          </div>
          {renameError ? (
            <p className="mt-1.5 text-[12px] text-destructive">{renameError}</p>
          ) : (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Names must be unique across this workspace.
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-muted-foreground">Website URL</p>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-[14px] border border-border bg-muted/40 px-3 py-2.5">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{address}</span>
          {onEditAddress ? (
            <button
              type="button"
              aria-label="Edit address"
              onClick={onEditAddress}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          ) : null}
          {onCopyAddress ? (
            <button
              type="button"
              aria-label="Copy address"
              onClick={onCopyAddress}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          ) : null}
        </div>
        <p className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Globe className="h-3.5 w-3.5" strokeWidth={1.6} />
          Visible to anyone with the link
        </p>
      </div>

      <div className="mt-4 space-y-0.5">
        <SheetAction
          icon={Upload}
          label="Publish"
          onClick={onPublish}
          primary
        />
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
        <SheetAction icon={RotateCw} label="Refresh" onClick={onRefresh} />
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
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
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
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center justify-end gap-0.5 px-3 pt-2">
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

function SheetAction({
  icon: Icon,
  label,
  onClick,
  active,
  primary,
}: {
  icon: typeof Upload;
  label: string;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left text-[15px] tracking-[-0.01em] transition-colors",
        primary
          ? "bg-foreground text-background hover:opacity-90"
          : active
            ? "bg-muted text-foreground"
            : "text-foreground hover:bg-muted/70",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />
      {label}
    </button>
  );
}
