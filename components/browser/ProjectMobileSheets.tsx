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
  Check,
  ChevronLeft,
  ExternalLink,
  Globe,
  MousePointer2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { useSpaceMutation, useSpaceProject } from "@/lib/hooks/use-space-query";
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
        className="absolute inset-0 bg-black/35"
        style={{ opacity: Math.max(0.15, 1 - dragY / 320) }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex w-full max-w-[100vw] flex-col overflow-hidden border border-border bg-background shadow-[0_-12px_40px_rgba(0,0,0,0.18)]",
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

type ActionsPane = "main" | "publish" | "domains";

export function ProjectActionsSheetBody({
  published,
  selectMode,
  canRename,
  onOpenExternal,
  onSelectElement,
  onRename,
  onDelete,
}: {
  published?: boolean;
  selectMode?: boolean;
  canRename?: boolean;
  onOpenExternal: () => void;
  onSelectElement: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [pane, setPane] = useState<ActionsPane>("main");
  const publishLabel = published ? "Republish" : "Publish";

  useEffect(() => {
    setPane("main");
  }, [published]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          pane === "main" ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)] pt-1">
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

          <div className="mt-3 space-y-0.5">
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
          pane === "publish" ? "translate-x-0" : "translate-x-full",
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
          pane === "domains" ? "translate-x-0" : "translate-x-full",
        )}
      >
        <SheetSubHeader title="Domains" onBack={() => setPane("main")} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]">
          <p className="text-[14px] text-muted-foreground">
            Connect a custom domain to this project. Domain settings are coming
            soon.
          </p>
        </div>
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
  const { publishApp, liveUrl, project, projectId } = useApp();
  const { project: entityProject } = useSpaceProject(projectId);
  const { publishBuild } = useSpaceMutation();
  const displayName = entityProject?.title ?? project?.name ?? "app";
  const slug = displayName.toLowerCase().replace(/\s+/g, "-");
  const hostedUrl = `https://${slug}.cander.app`;
  const domains = entityProject?.domains ?? project?.domains ?? [];
  const options = useMemo(
    () => [
      {
        id: "cander",
        url: hostedUrl,
        label: `${slug}.cander.app`,
        hint: "Verified subdomain",
      },
      ...domains.map((domain) => ({
        id: domain,
        url: domain.startsWith("http") ? domain : `https://${domain}`,
        label: domain.replace(/^https?:\/\//, ""),
        hint: "From this project",
      })),
    ],
    [hostedUrl, domains, slug],
  );
  const [selected, setSelected] = useState(options[0]?.id ?? "cander");
  const [busy, setBusy] = useState(false);
  const chosen = options.find((item) => item.id === selected) ?? options[0];
  const url = liveUrl && selected === "cander" ? liveUrl : chosen?.url;

  const handlePublish = useCallback(async () => {
    if (!projectId || busy || !url) return;
    setBusy(true);
    try {
      const result = await publishBuild(projectId, url);
      publishApp(result.url);
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
      <p className="mt-4 text-[13px] font-medium">Domain</p>
      <div className="mt-2 space-y-2">
        {options.map((item) => {
          const on = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-[12px] border px-3 py-2.5 text-left",
                on ? "border-foreground/25 bg-muted" : "border-border",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  on
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {on ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={2.4} />
                ) : null}
              </span>
              <span>
                <span className="block font-mono text-[13px]">{item.label}</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {item.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] font-medium">Environment</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Production</p>
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
}: {
  icon?: typeof Upload;
  label: string;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
  destructive?: boolean;
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
          : destructive
            ? "text-destructive hover:bg-destructive/10"
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
