"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  Download,
  ExternalLink,
  Globe,
  Pencil,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import {
  PublishDomainPicker,
  ProjectDomainsManager,
  usePublishDomainOptions,
} from "@/components/preview/PublishDomainPicker";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { resolvePublishUrl } from "@/lib/publish-domain";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { cn } from "@/lib/utils";

export type ProjectSheetMode = "actions" | "info" | "add" | "rename" | "delete" | "space";

const DISMISS_PX = 110;
const DISMISS_VELOCITY = 0.55;

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
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setDragging(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onHandleTouchStart = (event: ReactTouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    startY.current = touch.clientY;
    lastY.current = touch.clientY;
    lastT.current = performance.now();
    velocity.current = 0;
    setDragging(true);
  };

  const onHandleTouchMove = (event: ReactTouchEvent) => {
    if (!dragging) return;
    const touch = event.touches[0];
    if (!touch) return;
    const now = performance.now();
    const dy = touch.clientY - startY.current;
    const dt = Math.max(1, now - lastT.current);
    velocity.current = (touch.clientY - lastY.current) / dt;
    lastY.current = touch.clientY;
    lastT.current = now;
    setDragY(dy < 0 ? dy * 0.25 : dy);
  };

  const onHandleTouchEnd = () => {
    if (!dragging) return;
    setDragging(false);
    const shouldClose =
      dragY > DISMISS_PX ||
      (dragY > 40 && velocity.current > DISMISS_VELOCITY) ||
      (dragY < -48 && Math.abs(velocity.current) > DISMISS_VELOCITY);
    if (shouldClose) {
      onClose();
      setDragY(0);
      return;
    }
    setDragY(0);
  };

  const heightClass =
    mode === "actions"
      ? "min-h-[min(58dvh,520px)] max-h-[92dvh]"
      : mode === "add" || mode === "rename" || mode === "delete"
        ? "min-h-[min(85dvh,720px)] max-h-[92dvh]"
        : mode === "info" || mode === "space"
          ? "max-h-[92dvh]"
          : "max-h-[70dvh]";

  const sheet = (
    <div className="fixed inset-0 z-[80] flex max-w-[100vw] flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/35 dark:bg-black/55"
        style={{ opacity: Math.max(0.15, 1 - dragY / 320) }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "mobile-glass-panel relative z-10 flex w-full max-w-[100vw] flex-col overflow-hidden border border-border text-foreground shadow-[0_-12px_40px_rgba(0,0,0,0.18)]",
          // Dark material must win even if glass CSS fails to match — light
          // frosted + dark tokens made titles nearly invisible.
          "dark:border-white/10 dark:bg-[oklch(0.17_0.01_265/0.94)] dark:text-[oklch(0.98_0_0)] dark:shadow-[0_-12px_40px_rgba(0,0,0,0.45)]",
          "rounded-t-[22px]",
          heightClass,
          className,
        )}
        style={{
          transform: `translate3d(0, ${Math.max(0, dragY)}px, 0)`,
          transition: dragging
            ? "none"
            : "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className="flex shrink-0 touch-none justify-center pt-2.5 pb-1"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onTouchCancel={onHandleTouchEnd}
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
        </div>
        <div id={titleId} className="sr-only">
          Sheet
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <NativeOverlayGate open={open && mounted} />
      {open && mounted ? createPortal(sheet, document.body) : null}
    </>
  );
}

/**
 * Apple Photos–style header actions popover for mobile ⋯ / filter.
 * Anchors top-right; tap outside or choose an action to dismiss.
 * Menu is a direct `body` portal sibling of the dismiss layer so
 * `backdrop-filter` can sample page content (nesting inside a fixed
 * fullscreen wrapper makes WebKit paint a flat opaque card).
 */
export function MobileHeaderActionsPopover({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    // Capture-phase outside tap — must close even when composer sticky-keyboard
    // calls preventDefault on touchstart (which otherwise kills the scrim click).
    const onOutside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-header-actions-menu]")) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("touchstart", onOutside, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("touchstart", onOutside, true);
    };
  }, [open]);

  if (!open || !mounted) {
    return <NativeOverlayGate open={false} />;
  }

  const dismiss = (
    <button
      type="button"
      aria-label="Dismiss"
      data-header-actions-dismiss=""
      data-allow-keyboard-dismiss=""
      className="fixed inset-0 z-[85] cursor-default bg-transparent"
      onClick={() => onCloseRef.current()}
      onPointerDown={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
    />
  );

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      data-header-actions-menu=""
      aria-labelledby={titleId}
      className={cn(
        "mobile-glass-popover fixed right-3 z-[86]",
        "top-[calc(env(safe-area-inset-top,0px)+0.65rem)]",
        "flex max-h-[min(70vh,28rem)] w-[min(17.5rem,calc(100vw-1.5rem))] flex-col",
        "rounded-[18px] text-foreground",
        className,
      )}
    >
      <span id={titleId} className="sr-only">
        Actions
      </span>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5">
        {children}
      </div>
    </div>
  );

  return (
    <>
      <NativeOverlayGate open />
      {createPortal(dismiss, document.body)}
      {createPortal(menu, document.body)}
    </>
  );
}

/** @deprecated Prefer MobileHeaderActionsPopover */
export const MobileGlassActionsMenu = MobileHeaderActionsPopover;

type ActionsPane = "main" | "publish" | "domains";

export function ProjectActionsSheetBody({
  published,
  selectMode,
  canRename,
  onOpenExternal,
  onSelectElement,
  onRename,
  onDelete,
  onReload,
  compact = false,
}: {
  published?: boolean;
  selectMode?: boolean;
  canRename?: boolean;
  onOpenExternal: () => void;
  onSelectElement: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onReload?: () => void;
  /** Tighter padding when embedded in the header popover. */
  compact?: boolean;
}) {
  const [pane, setPane] = useState<ActionsPane>("main");
  const publishLabel = published ? "Republish" : "Publish";

  useEffect(() => {
    setPane("main");
  }, [published]);

  const bodyPad = compact
    ? "px-1 pb-1 pt-0"
    : "px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)] pt-1";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          pane === "main" ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", bodyPad)}>
          {!compact ? (
            <div className="flex items-center gap-3 px-3 py-1">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    published ? "bg-emerald-500" : "bg-muted-foreground/50",
                  )}
                />
              </span>
              <p className="text-[15px] font-medium tracking-[-0.01em]">
                {published ? "Published" : "Draft"}
              </p>
            </div>
          ) : null}

          <div className={cn("space-y-0.5", !compact && "mt-3")}>
            <SheetAction
              icon={Upload}
              label={publishLabel}
              onClick={() => setPane("publish")}
            />
            <SheetAction
              icon={Globe}
              label="Domains"
              onClick={() => setPane("domains")}
            />
            <SheetAction
              icon={ExternalLink}
              label="Open in new tab"
              onClick={onOpenExternal}
            />
            {onReload ? (
              <SheetAction icon={RotateCw} label="Reload" onClick={onReload} />
            ) : null}
            {canRename && onRename ? (
              <SheetAction
                icon={Pencil}
                label="Rename project"
                onClick={onRename}
              />
            ) : null}
            {onDelete ? (
              <SheetAction
                icon={Trash2}
                label="Delete project"
                onClick={onDelete}
                destructive
              />
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 flex flex-col bg-background transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          pane === "publish"
            ? "translate-x-0"
            : "pointer-events-none translate-x-full",
        )}
      >
        <SheetSubHeader title={publishLabel} onBack={() => setPane("main")} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]">
          <PublishPaneBody published={published} />
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 flex flex-col bg-background transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          pane === "domains"
            ? "translate-x-0"
            : "pointer-events-none translate-x-full",
        )}
      >
        <SheetSubHeader title="Domains" onBack={() => setPane("main")} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]">
          <ProjectDomainsManager />
        </div>
      </div>
    </div>
  );
}

/** Actions for media projects. These intentionally omit website-only publishing controls. */
export function ProjectMediaActionsSheetBody({
  onDownload,
  onReplace,
  onRemove,
  disabled = false,
  compact = false,
}: {
  onDownload: () => void;
  onReplace: () => void;
  onRemove: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "px-1 pb-1 pt-0"
          : "px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)] pt-1"
      }
    >
      <div className="space-y-0.5">
        <SheetAction icon={Download} label="Download" disabled={disabled} onClick={onDownload} />
        <SheetAction icon={Upload} label="Replace" disabled={disabled} onClick={onReplace} />
        <SheetAction icon={Trash2} label="Remove" disabled={disabled} destructive onClick={onRemove} />
      </div>
    </div>
  );
}

function SheetSubHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-0.5">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
      </button>
      <p className="text-[16px] font-medium tracking-[-0.01em]">{title}</p>
    </div>
  );
}

function PublishPaneBody({ published = false }: { published?: boolean }) {
  const { publishApp, liveUrl, projectId } = useApp();
  const { publishBuild } = useSpaceMutation();
  const options = usePublishDomainOptions();
  const [selected, setSelected] = useState(options[0]?.id ?? "cander");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = useMemo(
    () => resolvePublishUrl(options, selected, liveUrl),
    [options, selected, liveUrl],
  );

  useEffect(() => {
    setSelected(options[0]?.id ?? "cander");
  }, [options]);

  const handlePublish = useCallback(async () => {
    if (!projectId || busy || !url) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publishBuild(projectId, url);
      publishApp(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, projectId, publishApp, publishBuild, url]);

  const publishLabel = published ? "Republish" : "Publish";

  return (
    <div>
      <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em]">
        {published ? "Republish your app" : "Publish your app"}
      </h2>
      <p className="mt-4 text-[13px] font-medium">Publish domain</p>
      <PublishDomainPicker
        options={options}
        selected={selected}
        onSelect={setSelected}
        className="mt-2 [&_button]:rounded-[12px]"
      />
      <p className="mt-4 text-[13px] font-medium">Environment</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Production — deploys the current draft tip via Vercel
      </p>
      {error ? (
        <p className="mt-3 text-[13px] leading-relaxed text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || !projectId}
        onClick={() => void handlePublish()}
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-[14px] font-medium text-background disabled:opacity-50"
      >
        {busy ? "Publishing…" : publishLabel}
      </button>
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

export function ProjectAddSheetHeader({
  query,
  onQueryChange,
  onSubmit,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onClose?: () => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="shrink-0 px-4 pb-2 pt-1">
      <p className="text-[17px] font-medium tracking-[-0.02em]">Add tab</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Search the web or open another project as a tab.
      </p>
      <form
        className="mt-3"
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

/** @deprecated Prefer chrome ⋯ actions; kept for type compat. */
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

export function SheetAction({
  icon: Icon,
  label,
  onClick,
  active,
  primary,
  destructive,
  description,
  disabled = false,
}: {
  icon?: typeof Upload;
  label: string;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
  destructive?: boolean;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors",
        primary
          ? "bg-foreground text-background hover:opacity-90"
          : destructive
            ? "text-destructive hover:bg-destructive/10"
          : active
            ? "bg-muted text-foreground"
            : "text-foreground hover:bg-muted/70",
        disabled && "cursor-not-allowed opacity-45",
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

export function DeleteProjectSheetBody({
  projectName,
  busy,
  confirmText,
  onConfirmTextChange,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  busy?: boolean;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ok = confirmText.trim().toLowerCase() === "delete";
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-1">
      <p className="text-[17px] font-medium tracking-[-0.02em]">Delete project</p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        This permanently removes{" "}
        <span className="font-medium text-foreground">{projectName}</span> and
        its build history from this workspace. Type{" "}
        <span className="font-medium text-foreground">delete</span> to confirm.
      </p>
      <input
        autoFocus
        value={confirmText}
        onChange={(event) => onConfirmTextChange(event.target.value)}
        placeholder='Type "delete"'
        aria-label='Type "delete" to confirm project deletion'
        className="mt-4 h-11 w-full rounded-[12px] border border-border bg-muted/30 px-3 text-[14px] outline-none"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-[10px] px-4 text-[14px] text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!ok || busy}
          onClick={onConfirm}
          className="h-10 rounded-[10px] bg-destructive px-4 text-[14px] font-medium text-destructive-foreground disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete project"}
        </button>
      </div>
    </div>
  );
}
