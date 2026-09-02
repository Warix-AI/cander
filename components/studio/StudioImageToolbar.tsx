"use client";

import { useState } from "react";
import { ChevronDown, Ratio, Square, RectangleHorizontal, RectangleVertical } from "lucide-react";
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
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
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
  className,
}: {
  busy?: boolean;
  onRemoveBackground: () => void;
  onResize: (preset: StudioResizePresetId) => void;
  className?: string;
}) {
  const [resizeOpen, setResizeOpen] = useState(false);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3",
        className,
      )}
    >
      <div className="pointer-events-auto relative">
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-background/90 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)] backdrop-blur-md dark:bg-neutral-900/90">
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

        {resizeOpen ? (
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
