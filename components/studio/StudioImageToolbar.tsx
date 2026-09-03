"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Pencil,
  Ratio,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  X,
} from "lucide-react";
import {
  STUDIO_RESIZE_PRESETS,
  type StudioResizePresetId,
} from "@/lib/studio-assets-client";
import { cn } from "@/lib/utils";

function RatioGlyph({
  ratio,
  className,
}: {
  ratio: string;
  className?: string;
}) {
  const cls = cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className);
  if (ratio === "1:1") return <Square className={cls} strokeWidth={1.7} />;
  if (ratio === "3:4" || ratio === "9:16") {
    return <RectangleVertical className={cls} strokeWidth={1.7} />;
  }
  return <RectangleHorizontal className={cls} strokeWidth={1.7} />;
}

/** Transparency checkerboard mark for Remove BG. */
function RemoveBgIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      aria-hidden
      fill="none"
    >
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2 11.5 11.5 2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9.2 12.2h3.3v-3.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StudioImageToolbar({
  busy = false,
  onRemoveBackground,
  onResize,
  onSuggestEdit,
  className,
}: {
  busy?: boolean;
  onRemoveBackground: () => void;
  onResize: (preset: StudioResizePresetId) => void;
  onSuggestEdit: (prompt: string) => void;
  className?: string;
}) {
  const [resizeOpen, setResizeOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editMode) return;
    inputRef.current?.focus();
  }, [editMode]);

  useEffect(() => {
    if (busy) {
      setEditMode(false);
      setResizeOpen(false);
      setDraft("");
    }
  }, [busy]);

  const submitEdit = () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setEditMode(false);
    setDraft("");
    onSuggestEdit(prompt);
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3",
        className,
      )}
    >
      <div className="pointer-events-auto relative">
        {editMode ? (
          <div className="inline-flex w-[min(28rem,calc(100vw-2rem))] items-center gap-1 rounded-full border border-border/70 bg-background/90 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)] backdrop-blur-md dark:bg-neutral-900/90">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              disabled={busy}
              placeholder="Suggest an edit…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitEdit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditMode(false);
                  setDraft("");
                }
              }}
              className="h-8 min-w-0 flex-1 bg-transparent px-3 text-[12.5px] tracking-[-0.01em] outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy}
              aria-label="Cancel edit"
              onClick={() => {
                setEditMode(false);
                setDraft("");
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={submitEdit}
              className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-foreground disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-background/90 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)] backdrop-blur-md dark:bg-neutral-900/90">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setResizeOpen(false);
                setEditMode(true);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium tracking-[-0.01em] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.7} />
              Suggest Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onRemoveBackground}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium tracking-[-0.01em] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <RemoveBgIcon className="h-3.5 w-3.5" />
              Remove BG
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setResizeOpen((open) => !open)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium tracking-[-0.01em] text-foreground transition-colors hover:bg-muted disabled:opacity-50",
                resizeOpen && "bg-muted",
              )}
            >
              <Ratio className="h-3.5 w-3.5" strokeWidth={1.7} />
              Resize
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  resizeOpen && "rotate-180",
                )}
                strokeWidth={2}
              />
            </button>
          </div>
        )}

        {resizeOpen && !editMode ? (
          <div className="absolute top-[calc(100%+0.4rem)] left-1/2 z-30 w-[13.5rem] -translate-x-1/2 overflow-hidden rounded-[14px] border border-border/70 bg-background/95 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)] backdrop-blur-md dark:bg-neutral-900/95">
            {STUDIO_RESIZE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setResizeOpen(false);
                  onResize(preset.id);
                }}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] tracking-[-0.01em] hover:bg-muted disabled:opacity-50"
              >
                <RatioGlyph ratio={preset.ratio} />
                <span className="flex-1 font-medium">{preset.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {preset.ratio}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
